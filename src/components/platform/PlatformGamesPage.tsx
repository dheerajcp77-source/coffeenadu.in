import React, { useEffect, useState } from 'react';
import { ArrowLeft, Award, CheckCircle2, Gamepad2, RotateCcw, Sparkles, Trophy } from 'lucide-react';
import { fetchPlatformGames, submitQuizAnswers } from '../../services/platformClient';
import type {
  LocalityOption,
  PlatformLanguage,
  PlatformQuiz,
  QuizLeaderboardEntry,
} from '../../types/platform';
import { pickLangText } from '../../utils/platformHelpers';

interface PlatformGamesPageProps {
  lang: PlatformLanguage;
  localities: LocalityOption[];
  onBackHome: () => void;
}

interface WordPuzzle {
  id: string;
  wordKn: string;
  syllables: string[];
  hintKn: string;
  hintEn: string;
}

export const PlatformGamesPage: React.FC<PlatformGamesPageProps> = ({
  lang,
  localities,
  onBackHome,
}) => {
  const [quizzes, setQuizzes] = useState<PlatformQuiz[]>([]);
  const [wordPuzzles, setWordPuzzles] = useState<WordPuzzle[]>([]);
  const [leaderboard, setLeaderboard] = useState<QuizLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'quiz' | 'word'>('quiz');
  const [selectedQuiz, setSelectedQuiz] = useState<PlatformQuiz | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [playerLocation, setPlayerLocation] = useState('Koppa');
  const [startedAtMs, setStartedAtMs] = useState<number>(Date.now());
  const [quizResult, setQuizResult] = useState<{ score: number; total: number; percentage: number } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  // Kannada Word Puzzle state
  const [wordIdx, setWordIdx] = useState(0);
  const [pickedIndices, setPickedIndices] = useState<number[]>([]);
  const [wordSolvedCount, setWordSolvedCount] = useState(0);

  useEffect(() => {
    let active = true;
    fetchPlatformGames()
      .then((res) => {
        if (!active) return;
        setQuizzes(res.quizzes || []);
        setWordPuzzles(res.wordPuzzles || []);
        setLeaderboard(res.leaderboard || []);
        if (res.quizzes && res.quizzes.length > 0) {
          setSelectedQuiz(res.quizzes[0]);
          setAnswers(new Array(res.quizzes[0].questions.length).fill(-1));
          setStartedAtMs(Date.now());
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSelectQuiz = (q: PlatformQuiz) => {
    setSelectedQuiz(q);
    setAnswers(new Array(q.questions.length).fill(-1));
    setQuizResult(null);
    setStartedAtMs(Date.now());
  };

  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuiz) return;
    setSubmitting(true);
    try {
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtMs) / 1000));
      const resp = await submitQuizAnswers(selectedQuiz.id, {
        answers,
        playerName: playerName.trim() || 'Malnad Reader',
        location: playerLocation,
        durationSec,
      });
      setQuizResult(resp.result);
      setLeaderboard(resp.leaderboard || []);
    } finally {
      setSubmitting(false);
    }
  };

  const currentPuzzle = wordPuzzles[wordIdx];
  const assembledWord = currentPuzzle
    ? pickedIndices.map((idx) => currentPuzzle.syllables[idx]).join('')
    : '';
  const isWordCorrect = Boolean(currentPuzzle && assembledWord === currentPuzzle.wordKn);

  const handlePickSyllable = (idx: number) => {
    if (pickedIndices.includes(idx)) return;
    const next = [...pickedIndices, idx];
    setPickedIndices(next);
    if (currentPuzzle) {
      const word = next.map((i) => currentPuzzle.syllables[i]).join('');
      if (word === currentPuzzle.wordKn) {
        setWordSolvedCount((c) => c + 1);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#176B4A] dark:text-[#D9A441] hover:underline cursor-pointer mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{pickLangText('ಮುಖಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ', 'Back to Home', lang)}</span>
        </button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-[#D9A441] flex items-center justify-center">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-kannada text-xl sm:text-2xl font-extrabold text-[#10243D] dark:text-white">
                {pickLangText('ಮಲೆನಾಡು ಆಟಗಳು ಮತ್ತು ರಸಪ್ರಶ್ನೆ', 'Malnad Games & Quizzes', lang)}
              </h1>
              <p className="text-xs sm:text-sm text-[#5A677A] dark:text-slate-300 font-kannada">
                {pickLangText(
                  'ಮಲೆನಾಡು ಜ್ಞಾನ ರಸಪ್ರಶ್ನೆ ಮತ್ತು ಕನ್ನಡ ಅಕ್ಷರ ಜೋಡಣೆ ಆಟ ಆಡಿ',
                  'Play Malnad heritage trivia quizzes, Kannada word puzzles & climb the leaderboard',
                  lang
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('quiz')}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                activeTab === 'quiz'
                  ? 'bg-[#10243D] text-white dark:bg-[#D9A441] dark:text-[#10243D]'
                  : 'bg-[#F3F6F8] dark:bg-slate-800 text-[#475569] dark:text-slate-300'
              }`}
            >
              {pickLangText('ರಸಪ್ರಶ್ನೆ (Quiz)', 'Malnad Quizzes', lang)}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('word')}
              className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                activeTab === 'word'
                  ? 'bg-[#176B4A] text-white'
                  : 'bg-[#F3F6F8] dark:bg-slate-800 text-[#475569] dark:text-slate-300'
              }`}
            >
              {pickLangText('ಕನ್ನಡ ಪದ ಆಟ', 'Kannada Word Game', lang)}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Play Area */}
        <div className="lg:col-span-8 space-y-4">
          {loading ? (
            <div className="h-64 rounded-2xl bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 animate-pulse" />
          ) : activeTab === 'quiz' ? (
            <>
              {/* Quiz Selector */}
              <div className="flex flex-wrap gap-2">
                {quizzes.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleSelectQuiz(q)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer font-kannada border ${
                      selectedQuiz?.id === q.id
                        ? 'bg-[#176B4A] text-white border-[#176B4A]'
                        : 'bg-white dark:bg-[#111F33] text-[#10243D] dark:text-slate-200 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {pickLangText(q.titleKn, q.titleEn, lang)} ({q.questions.length})
                  </button>
                ))}
              </div>

              {selectedQuiz && (
                <form
                  onSubmit={handleSubmitQuiz}
                  className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5"
                >
                  <div>
                    <h2 className="font-kannada text-lg font-extrabold text-[#10243D] dark:text-white">
                      {pickLangText(selectedQuiz.titleKn, selectedQuiz.titleEn, lang)}
                    </h2>
                    <p className="text-xs text-[#5A677A] dark:text-slate-400 font-kannada mt-0.5">
                      {pickLangText(selectedQuiz.descriptionKn, selectedQuiz.descriptionEn, lang)}
                    </p>
                  </div>

                  {quizResult && (
                    <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Award className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <div className="text-base font-extrabold text-emerald-900 dark:text-emerald-100">
                            {pickLangText('ನಿಮ್ಮ ಅಂಕ:', 'Your Score:', lang)} {quizResult.score} /{' '}
                            {quizResult.total} ({quizResult.percentage}%)
                          </div>
                          <p className="text-xs text-emerald-700 dark:text-emerald-300">
                            {pickLangText(
                              'ಲೀಡರ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಹೆಸರು ಸೇರ್ಪಡೆಯಾಗಿದೆ!',
                              'Your score has been recorded on the Malnad leaderboard!',
                              lang
                            )}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectQuiz(selectedQuiz)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 text-xs font-bold text-[#10243D] dark:text-white border border-emerald-300 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{pickLangText('ಮತ್ತೆ ಆಡಿ', 'Play Again', lang)}</span>
                      </button>
                    </div>
                  )}

                  <div className="space-y-4">
                    {selectedQuiz.questions.map((question, qIdx) => (
                      <div
                        key={question.id}
                        className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-2.5"
                      >
                        <p className="font-kannada text-sm font-bold text-[#10243D] dark:text-white">
                          {qIdx + 1}. {pickLangText(question.questionKn, question.questionEn, lang)}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {question.options.map((opt, oIdx) => {
                            const picked = answers[qIdx] === oIdx;
                            const isCorrect = quizResult && question.correctIndex === oIdx;
                            const isWrongPick = quizResult && picked && question.correctIndex !== oIdx;
                            return (
                              <button
                                key={oIdx}
                                type="button"
                                disabled={Boolean(quizResult)}
                                onClick={() => {
                                  const next = [...answers];
                                  next[qIdx] = oIdx;
                                  setAnswers(next);
                                }}
                                className={`text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold font-kannada transition-colors cursor-pointer ${
                                  isCorrect
                                    ? 'bg-emerald-100 border-emerald-500 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-100'
                                    : isWrongPick
                                      ? 'bg-rose-100 border-rose-500 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
                                      : picked
                                        ? 'bg-[#10243D] border-[#10243D] text-white dark:bg-[#D9A441] dark:text-[#10243D]'
                                        : 'bg-white dark:bg-[#111F33] border-slate-200 dark:border-slate-700 text-[#10243D] dark:text-slate-200 hover:border-[#176B4A]'
                                }`}
                              >
                                {pickLangText(opt.kn, opt.en, lang)}
                              </button>
                            );
                          })}
                        </div>
                        {quizResult && (question.explanationKn || question.explanationEn) && (
                          <p className="text-[11px] text-[#176B4A] dark:text-emerald-300 font-kannada pt-1">
                            {pickLangText(
                              question.explanationKn || '',
                              question.explanationEn || '',
                              lang
                            )}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {!quizResult && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          {pickLangText('ನಿಮ್ಮ ಹೆಸರು', 'Your Name', lang)}
                        </label>
                        <input
                          value={playerName}
                          onChange={(e) => setPlayerName(e.target.value)}
                          placeholder={pickLangText('ಉದಾ: ರಮೇಶ್ ಕೊಪ್ಪ', 'e.g., Ramesh', lang)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                          {pickLangText('ಊರು', 'Location', lang)}
                        </label>
                        <select
                          value={playerLocation}
                          onChange={(e) => setPlayerLocation(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        >
                          {localities.map((l) => (
                            <option key={l.id} value={l.nameEn}>
                              {l.nameEn}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="submit"
                        disabled={submitting || answers.some((a) => a < 0)}
                        className="w-full px-4 py-2.5 rounded-xl bg-[#176B4A] hover:bg-[#12553A] disabled:opacity-50 text-white text-xs font-bold cursor-pointer min-h-[40px]"
                      >
                        {submitting
                          ? pickLangText('ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...', 'Checking...', lang)
                          : pickLangText('ಉತ್ತರ ಸಲ್ಲಿಸಿ', 'Submit Quiz', lang)}
                      </button>
                    </div>
                  )}
                </form>
              )}
            </>
          ) : (
            /* Kannada Word Game */
            currentPuzzle && (
              <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 text-sm font-extrabold text-[#10243D] dark:text-white font-kannada">
                    <Sparkles className="w-4 h-4 text-[#D9A441]" />
                    <span>
                      {pickLangText('ಕನ್ನಡ ಪದ ಜೋಡಿಸಿ', 'Unscramble the Malnad Word', lang)} (
                      {wordIdx + 1}/{wordPuzzles.length})
                    </span>
                  </div>
                  <div className="text-xs font-bold text-[#176B4A] dark:text-emerald-400">
                    {pickLangText('ಬಿಡಿಸಿದ ಪದಗಳು:', 'Solved:', lang)} {wordSolvedCount}
                  </div>
                </div>

                <p className="text-sm text-[#5A677A] dark:text-slate-300 font-kannada bg-[#F8FAFC] dark:bg-slate-900 p-3.5 rounded-xl">
                  <strong>{pickLangText('ಸುಳಿವು:', 'Hint:', lang)}</strong>{' '}
                  {pickLangText(currentPuzzle.hintKn, currentPuzzle.hintEn, lang)}
                </p>

                <div className="min-h-[60px] p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-2xl font-kannada font-extrabold text-[#10243D] dark:text-white tracking-wide">
                  {assembledWord || pickLangText('ಕೆಳಗಿನ ಅಕ್ಷರಗಳನ್ನು ಕ್ರಮವಾಗಿ ಒತ್ತಿ', 'Tap syllables below in order', lang)}
                </div>

                <div className="flex flex-wrap justify-center gap-2.5">
                  {currentPuzzle.syllables.map((syl, idx) => {
                    const used = pickedIndices.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={used}
                        onClick={() => handlePickSyllable(idx)}
                        className={`px-4 py-3 rounded-xl text-lg font-kannada font-bold border transition-all cursor-pointer min-w-[56px] ${
                          used
                            ? 'opacity-30 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                            : 'bg-white dark:bg-slate-900 border-[#176B4A]/40 hover:bg-[#176B4A] hover:text-white text-[#10243D] dark:text-white'
                        }`}
                      >
                        {syl}
                      </button>
                    );
                  })}
                </div>

                {isWordCorrect ? (
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-200 font-kannada">
                      <CheckCircle2 className="w-5 h-5" />
                      <span>
                        {pickLangText('ಅದ್ಭುತ! ಸರಿಯಾದ ಪದ:', 'Correct! Word:', lang)} {currentPuzzle.wordKn}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPickedIndices([]);
                        setWordIdx((prev) => (prev + 1) % wordPuzzles.length);
                      }}
                      className="px-4 py-2 rounded-xl bg-[#176B4A] text-white text-xs font-bold cursor-pointer"
                    >
                      {pickLangText('ಮುಂದಿನ ಪದ →', 'Next Word →', lang)}
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setPickedIndices([])}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{pickLangText('ಮರುಪ್ರಯತ್ನಿಸಿ', 'Clear', lang)}</span>
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Leaderboard Rail */}
        <aside className="lg:col-span-4">
          <div className="bg-white dark:bg-[#111F33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#D9A441]" />
              <h2 className="font-kannada text-base font-extrabold text-[#10243D] dark:text-white">
                {pickLangText('ಮಲೆನಾಡು ಲೀಡರ್‌ಬೋರ್ಡ್', 'Community Leaderboard', lang)}
              </h2>
            </div>

            {leaderboard.length === 0 ? (
              <p className="text-xs text-[#5A677A] dark:text-slate-400 font-kannada">
                {pickLangText(
                  'ಮೊದಲ ರಸಪ್ರಶ್ನೆ ಆಡಿ ಲೀಡರ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ಅಗ್ರಸ್ಥಾನ ಪಡೆಯಿರಿ!',
                  'Complete a quiz to claim the #1 spot on the Coffeenadu leaderboard.',
                  lang
                )}
              </p>
            ) : (
              <ol className="space-y-2">
                {leaderboard.slice(0, 10).map((entry, idx) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-slate-900/60 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-[#10243D] dark:bg-[#D9A441] text-white dark:text-[#10243D] flex items-center justify-center text-[10px] font-extrabold shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-[#10243D] dark:text-white truncate">
                          {entry.playerName}
                        </div>
                        <div className="text-[10px] text-slate-500">{entry.location}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-extrabold text-[#176B4A] dark:text-emerald-400">
                        {entry.score}/{entry.total}
                      </div>
                      <div className="text-[10px] text-slate-400">{entry.durationSec}s</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
