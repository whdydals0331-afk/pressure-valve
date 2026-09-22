// api/scene.js — Vercel 서버리스 함수 (Node.js 런타임)
// 클라이언트에서 전달된 영어 표현/키워드로 유튜브의 실제 영화·미드 발화 장면 영상 ID를 즉시 검색하여 반환합니다.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=43200');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  var query = (req.query && req.query.q) ? String(req.query.q).trim() : '';
  if (!query) {
    res.status(400).json({ error: 'missing-query' });
    return;
  }

  // 검색 최적화: movie scene clip 키워드를 조합하여 실제 발화 명장면 우선 검색
  var searchKeywords = query + ' scene english movie clip';
  var searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(searchKeywords);

  try {
    var response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      res.status(502).json({ error: 'youtube-fetch-failed' });
      return;
    }

    var html = await response.text();
    var regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    var match;
    var videoIds = [];

    while ((match = regex.exec(html)) !== null) {
      var id = match[1];
      if (videoIds.indexOf(id) === -1) {
        videoIds.push(id);
      }
      if (videoIds.length >= 8) break;
    }

    if (videoIds.length === 0) {
      // 비상 fallback 대표 영상 ID들
      videoIds = ['gNR3gVXsMT4', 'xEvb7B4O698', '6B1i0RAtgAg', '6rzZ-4vXnqM'];
    }

    res.status(200).json({
      ok: true,
      query: query,
      videoIds: videoIds
    });
  } catch (err) {
    res.status(500).json({
      error: 'internal-error',
      message: err.message,
      videoIds: ['gNR3gVXsMT4', 'xEvb7B4O698', '6B1i0RAtgAg']
    });
  }
};
