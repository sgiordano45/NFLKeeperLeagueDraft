// ─── Audio Manager ───
// Plays the NFL draft horn at key moments:
//   1) Draft start
//   2) Each pick completed in round 1
//   3) Any pick that took > 60 seconds (slow pick cue)

const AudioManager = (() => {
  const SOUND_URL =
    'https://www.redringtones.com/wp-content/uploads/2022/03/nfl-draft-sound.mp3';

  // Lazily initialized so the browser doesn't block before user interaction
  let _audio = null;

  function _get() {
    if (!_audio) {
      _audio = new Audio(SOUND_URL);
      _audio.preload = 'auto';
    }
    return _audio;
  }

  /**
   * Play the draft horn.
   * Rewinds before each play so back-to-back calls (e.g. round-1 + slow pick)
   * still fire correctly. Silently swallows auto-play policy errors.
   */
  function playDraftSound() {
    try {
      const a = _get();
      a.currentTime = 0;
      a.play().catch((err) => {
        // Auto-play blocked — requires a prior user gesture (button click, etc.)
        console.warn('[AudioManager] Playback blocked by browser policy:', err.message);
      });
    } catch (err) {
      console.warn('[AudioManager] Could not play draft sound:', err);
    }
  }

  return { playDraftSound };
})();
