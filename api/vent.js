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
  '사용자가 한국어로(때로는 격하거나 두서없이) 적은 분노/답답한 상황을 읽고, 그 상황에 딱 맞는 찰진 영어 표현 하나를 만든다.',
  '',
  '규칙:',
  '1. 반드시 아래 JSON 형식으로만 답한다. 다른 말은 절대 덧붙이지 않는다.',
  '   {"category": "카테고리 id", "en": "영어 문장", "ko": "영어 문장의 직접적인 한국어 직역/해석 (사족이나 ~라는 뜻/설명 없이 직관적인 한국어 번역 1문장)", "tip": "어떤 뉘앙스로 언제 쓰는지 실전 활용 팁 (1문장)"}',
  '   category는 아래 다섯 중 그 상황에 가장 가까운 것 하나의 id를 쓴다:',
  '   - work: 직장·업무 (상사, 마감, 회의, 야근, 업무량)',
  '   - people: 사람·관계 (친구, 가족, 연인, 동료, 진상과의 갈등/분노)',
  '   - small: 소소한 빡침 (교통, 날씨, 기계 고장, 사소한 짜증)',
  '   - selfblame: 자책·실수 (내 실수, 후회, 자기비판)',
  '   - exhausted: 그냥 다 지침 (번아웃, 무기력, 다 귀찮음)',
  '2. 강도(intensity)는 3단계로 엄격하게 구분되며, 반드시 요청된 단계에만 맞는 어휘를 쓴다:',
  '   - mild (순한맛): 비속어/욕설 절대 금지. 비속어 없이도 뼈를 때리거나 분노/답답함/황당함을 담백하고 단호하게 표현한다.',
  '     (예: "Are you out of your mind?", "This is utterly ridiculous.", "I cannot stand this anymore.")',
  '   - medium (중간맛): damn, hell, crap, screw, freaking, sucks, pissed off 같은 가벼운 일상 비속어/짜증 표현만 허용한다.',
  '     ★ 절대 금지: fuck, shit, bitch, asshole, motherfucker 등 강한 욕설은 중간맛에 절대 들어가서는 안 된다!',
  '     (예: "What the hell is wrong with you?", "Damn it, this is driving me insane.", "Cut the crap and do your job.")',
  '   - spicy (매운맛): fuck, fucking, shit, bitch, asshole, motherfucker, bullshit, prick, goddamn 등 거침없고 필터링 없는 진짜 매운 실전 욕설이 반드시 직접적으로 포함되어야 한다. 절대로 순화하지 마라.',
  '     ★ 사용자가 상대방 욕("십새끼", "개새끼", "팀장새끼" 등)을 쓰거나 강한 분노를 썼다면, 그에 걸맞게 "You fucking piece of shit", "Fucking asshole", "What a fucking prick", "Fuck this shit", "Get the fuck out of my face" 등 매우 맵고 타격감 있는 실전 욕설을 거침없이 만들어라.',
  '3. 특정 실존 유명인의 실명을 넣지 않는다. 범죄·자해 조장은 금지하되, 일상적 분노 표출과 욕설은 매운맛 규칙에 따라 확실하게 제공한다.',
  '4. 입력에 자기 자신을 향한 비난이 담겨 있으면 비속어의 타깃을 "그 상황/습관"으로 돌린다.',
  '5. 문장은 1~2문장, 미드나 영화에서처럼 혼잣말로 씹어뱉거나 상대방 면전에 쏘아붙일 때 쓰는 생생한 실전 구어체로 쓴다.',
  '6. ko(번역)와 tip(활용 팁)의 내용이 겹치지 않도록 엄격히 구분한다. ko에는 오직 문장 자체의 깔끔한 한국어 번역만 쓰고, 상황 설명이나 뉘앙스 조언은 tip에만 작성한다.'
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

  var intensityDesc = {
    mild: '순한맛 (욕설/비속어 절대 금지, 담백하고 단호한 표현)',
    medium: '중간맛 (damn, hell, crap 등 약한 비속어만 허용, fuck/shit 등 강한 욕설 절대 금지)',
    spicy: '매운맛 (fuck, fucking, shit, bitch, asshole, bullshit 등 진짜 거친 실전 욕설 반드시 포함)'
  }[intensity] || intensity;

  var userPrompt = [
    '상황: ' + text,
    '강도: ' + intensity + ' (' + intensityDesc + ')',
    '지침: 지정된 강도(' + intensity + ')의 어휘 규칙을 엄격히 지켜 JSON으로만 출력하세요.'
  ].join('\n');

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
        temperature: 0.85,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt }
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

    var ALLOWED_CATEGORIES = ['work', 'people', 'small', 'selfblame', 'exhausted'];
    var category = (typeof parsed.category === 'string' && ALLOWED_CATEGORIES.indexOf(parsed.category) !== -1)
      ? parsed.category : '';

    res.status(200).json({
      category: category,
      en: parsed.en.trim(),
      ko: typeof parsed.ko === 'string' ? parsed.ko.trim() : '',
      tip: typeof parsed.tip === 'string' ? parsed.tip.trim() : ''
    });
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
};
