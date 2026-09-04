// api/vent.js — Vercel 서버리스 함수 (Node.js 런타임)
//
// "영어로 욕해 · Stress Gauge"의 자유 입력 프로토타입용 백엔드입니다.
// 사용자가 정해진 카테고리/상황에 안 맞는, 두서없는 한국어 하소연을 적으면
// Anthropic Claude API로 그 상황에 맞는 영어 벤팅 문구 하나를 만들어 돌려줍니다.
//
// ── 배포 전 꼭 해야 하는 설정 ────────────────────────────────────────────
// 1) 이 파일을 프로젝트 리포의 /api/vent.js 경로에 그대로 넣으세요
//    (Vercel은 /api 아래 .js 파일을 자동으로 서버리스 함수로 인식합니다.
//    별도 npm 패키지 설치나 package.json 수정은 필요 없습니다 — 이 파일은
//    Node 18+ 런타임에 기본 내장된 fetch만 사용합니다).
// 2) Vercel 프로젝트 설정 → Environment Variables 에서 ANTHROPIC_API_KEY를
//    추가하세요 (https://console.anthropic.com 에서 발급받은 API 키 — claude.ai
//    구독용 로그인과는 별개로, 사용한 만큼 과금되는 API 전용 키입니다).
// 3) (선택) ANTHROPIC_MODEL 환경변수로 모델을 바꿀 수 있습니다(기본값: claude-haiku-4-5-20251001). 안 정하면
//    아래 DEFAULT_MODEL을 씁니다 — 배포 시점에 Anthropic 문서에서 현재
//    쓸 수 있는 모델 이름인지 한 번 확인해주세요(모델 이름은 시간이 지나며 바뀝니다).
// 4) 환경변수 추가/변경 후에는 반드시 재배포(redeploy)해야 반영됩니다.
//
// ── 이 프로토타입이 아직 안 하는 것 (알려진 한계) ──────────────────────────
// - 요청 빈도 제한(rate limiting)이 없습니다. 친구들한테 링크를 넓게 공유하기
//   전에, 짧은 시간에 너무 많이 요청하면 막는 장치(예: Vercel KV/Upstash로
//   IP별 카운트)를 추가하는 걸 추천합니다 — 안 그러면 악의적 사용자가 API
//   비용을 계속 발생시킬 수 있어요.
// - 입력 내용에 대한 별도 콘텐츠 필터링은 하지 않습니다(Anthropic API 자체의
//   안전장치에 의존). 시스템 프롬프트로 실존 인물 지목·폭력·자해 조장은
//   막도록 지시했지만, 100% 보장은 아닙니다.
// - 캐싱이 없어서 같은 입력을 반복해도 매번 API를 호출합니다.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const MAX_INPUT_LENGTH = 300;

const SYSTEM_PROMPT = [
  '너는 "영어로 욕해 · Stress Gauge"라는, 한국어 사용자를 위한 스트레스 해소 앱의 문구 생성기다.',
  '사용자가 한국어로(때로는 두서없이) 적은 답답한 상황을 읽고, 그 상황에 맞는 짧은 영어 벤팅 표현 하나를 만든다.',
  '',
  '규칙:',
  '1. 반드시 아래 JSON 형식으로만 답한다. 다른 말은 절대 덧붙이지 않는다.',
  '   {"en": "영어 문장", "ko": "그 문장이 무슨 뜻/뉘앙스인지 한국어 설명", "tip": "언제 어떻게 쓰면 좋은지 한국어 팁"}',
  '2. 강도(intensity)는 요청받은 값을 그대로 따른다:',
  '   - mild: 비속어 전혀 없이, 답답함/짜증만 담백하게 표현',
  '   - medium: damn/hell/crap/screw 같은 약한 비속어 정도만 사용',
  '   - spicy: fuck/shit/asshole/bullshit 같은 진짜 비속어를 자연스럽게 사용한다 (순화하지 않는다)',
  '3. 특정 실존 인물을 지목하거나 실명을 넣지 않는다. 폭력·자해·혐오 표현은 만들지 않는다.',
  '4. 입력에 자기 자신을 향한 비난이 담겨 있으면, 그 감정을 무시하지 말되 비속어의 타깃은',
  '   "그 상황/습관"으로 돌리고 자기혐오를 더 키우는 표현은 만들지 않는다.',
  '5. 문장은 1~2문장, 실제 원어민이 혼잣말처럼 쓸 법한 자연스러운 톤으로 쓴다.'
].join('\n');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // 아직 환경변수를 안 넣었을 때 — 서버 로그에는 남지만 사용자에게는
    // 프론트엔드의 공통 "실제 배포 사이트에서만 동작해요" 안내로 보인다.
    res.status(500).json({ error: 'not-configured' });
    return;
  }

  var body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  var text = typeof body.text === 'string' ? body.text.trim() : '';
  var intensity = ['mild', 'medium', 'spicy'].indexOf(body.intensity) !== -1 ? body.intensity : 'mild';

  if (!text) {
    res.status(400).json({ error: 'empty-text' });
    return;
  }
  if (text.length > MAX_INPUT_LENGTH) {
    res.status(400).json({ error: 'text-too-long' });
    return;
  }

  try {
    var response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: '상황: ' + text + '\n강도: ' + intensity }
        ]
      })
    });

    if (!response.ok) {
      // 원인을 화면에서 바로 확인할 수 있도록 상류(Anthropic) 오류 내용을 그대로 넘긴다.
      // (API 키 값은 여기 담기지 않는다 — 오류 본문에는 type/message만 들어있다)
      var errText = '';
      try { errText = await response.text(); } catch (e) { errText = ''; }
      res.status(502).json({
        error: 'upstream-error',
        status: response.status,
        detail: errText ? errText.slice(0, 400) : ''
      });
      return;
    }

    var data = await response.json();
    var raw = (data && data.content && data.content[0] && data.content[0].text) || '';

    var parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      var match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch (e2) { parsed = null; }
      }
    }

    if (!parsed || typeof parsed.en !== 'string' || !parsed.en.trim()) {
      res.status(502).json({ error: 'bad-model-output' });
      return;
    }

    res.status(200).json({
      en: parsed.en.trim(),
      ko: typeof parsed.ko === 'string' ? parsed.ko.trim() : '',
      tip: typeof parsed.tip === 'string' ? parsed.tip.trim() : ''
    });
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
};
