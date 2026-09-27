// Emotion Audio Mapping & Playback Manager
// ElevenLabs 생성 오디오 정적 자산 연동 및 재생 관리

(function (global) {
  'use strict';

  var EMOTION_AUDIO_MAP = {
    "What the HELL are you doing?!": {
      emotion: "angry",
      src: "/audio/emotion/angry-001.mp3"
    },
    "Are you fucking kidding me right now?": {
      emotion: "angry",
      src: "/audio/emotion/angry-002.mp3"
    },
    "What the FUCK is wrong with you?!": {
      emotion: "angry",
      src: "/audio/emotion/angry-003.mp3"
    },
    "I told you — DON'T touch that.": {
      emotion: "angry",
      src: "/audio/emotion/angry-004.mp3"
    },
    "I've had ENOUGH of this shit.": {
      emotion: "angry",
      src: "/audio/emotion/angry-005.mp3"
    },
    "Just... get the fuck out.": {
      emotion: "angry",
      src: "/audio/emotion/angry-006.mp3"
    },
    "Oh, come on...": {
      emotion: "annoyed",
      src: "/audio/emotion/annoyed-001.mp3"
    },
    "I literally JUST told you that.": {
      emotion: "annoyed",
      src: "/audio/emotion/annoyed-002.mp3"
    }
  };

  // 대소문자, 부호, 공백 차이 방어 정규화 헬퍼
  function normalize(str) {
    return (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 정규화된 키 룩업 맵 구성
  var normalizedLookup = {};
  for (var rawText in EMOTION_AUDIO_MAP) {
    if (Object.prototype.hasOwnProperty.call(EMOTION_AUDIO_MAP, rawText)) {
      normalizedLookup[normalize(rawText)] = EMOTION_AUDIO_MAP[rawText];
    }
  }

  var audioCache = {};
  var currentAudio = null;

  // 오디오 자산 사전 로드 (브라우저 캐시 및 빠른 응답성 확보)
  function preloadAll() {
    for (var k in EMOTION_AUDIO_MAP) {
      if (Object.prototype.hasOwnProperty.call(EMOTION_AUDIO_MAP, k)) {
        var item = EMOTION_AUDIO_MAP[k];
        if (!audioCache[item.src]) {
          var audio = new Audio();
          audio.preload = 'auto';
          audio.src = item.src;
          audioCache[item.src] = audio;
        }
      }
    }
  }

  // 문장으로 오디오 객체 조회
  function findAudio(text) {
    if (!text) return null;
    if (EMOTION_AUDIO_MAP[text]) return EMOTION_AUDIO_MAP[text];
    var norm = normalize(text);
    return normalizedLookup[norm] || null;
  }

  // 현재 재생 중인 오디오 즉시 정지
  function stopCurrentAudio() {
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      } catch (e) { /* ignore */ }
      currentAudio = null;
    }
  }

  // MP3 재생 실행 (성공 시 true, 매칭 오디오 없으면 false 반환)
  function playEmotionAudio(text, callbacks) {
    callbacks = callbacks || {};
    var match = findAudio(text);
    if (!match) return false;

    // 기존 재생 오디오 중단
    stopCurrentAudio();

    var audio = audioCache[match.src];
    if (!audio) {
      audio = new Audio(match.src);
      audio.preload = 'auto';
      audioCache[match.src] = audio;
    }

    currentAudio = audio;
    try { audio.currentTime = 0; } catch (e) { /* ignore */ }

    var cleanup = function () {
      audio.removeEventListener('ended', handleEnd);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('pause', handlePause);
    };

    var handleEnd = function () {
      cleanup();
      if (currentAudio === audio) currentAudio = null;
      if (typeof callbacks.onEnd === 'function') callbacks.onEnd();
    };

    var handlePause = function () {
      if (audio.currentTime === 0 || audio.ended) {
        cleanup();
        if (currentAudio === audio) currentAudio = null;
        if (typeof callbacks.onEnd === 'function') callbacks.onEnd();
      }
    };

    var handleError = function (e) {
      cleanup();
      if (currentAudio === audio) currentAudio = null;
      if (typeof callbacks.onError === 'function') callbacks.onError(e);
    };

    audio.addEventListener('ended', handleEnd);
    audio.addEventListener('error', handleError);
    audio.addEventListener('pause', handlePause);

    var playPromise = audio.play();
    if (playPromise && playPromise.then) {
      playPromise.then(function () {
        if (typeof callbacks.onStart === 'function') callbacks.onStart();
      }).catch(function (err) {
        handleError(err);
      });
    } else {
      if (typeof callbacks.onStart === 'function') callbacks.onStart();
    }

    return true;
  }

  var EmotionAudioManager = {
    map: EMOTION_AUDIO_MAP,
    find: findAudio,
    play: playEmotionAudio,
    stop: stopCurrentAudio,
    preload: preloadAll,
    normalize: normalize
  };

  global.emotionAudio = EMOTION_AUDIO_MAP;
  global.EmotionAudioManager = EmotionAudioManager;

  // 브라우저 백그라운드 프리로드
  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(preloadAll);
    } else {
      setTimeout(preloadAll, 1200);
    }
  }
})(typeof window !== 'undefined' ? window : this);
