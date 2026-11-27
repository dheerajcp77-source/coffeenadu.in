import React, { useEffect, useState } from 'react';
import { Gamepad2, Plus, Trash2, Trophy } from 'lucide-react';
import {
  createAdminQuiz,
  deleteAdminQuiz,
  fetchAdminQuizzes,
  updateAdminQuiz,
} from '../../services/platformClient';
import type { PlatformQuiz, QuizLeaderboardEntry } from '../../types/platform';

export const Admin2GamesSection: React.FC = () => {
  const [quizzes, setQuizzes] = useState<PlatformQuiz[]>([]);
  const [leaderboard, setLeaderboard] = useState<QuizLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  const [newQuiz, setNewQuiz] = useState({
    titleKn: '',
    titleEn: '',
    descriptionKn: '',
    scheduleType: 'daily',
    questionKn: '',
    opt0: '',
    opt1: '',
    opt2: '',
    opt3: '',
    correctIndex: 0,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchAdminQuizzes();
      setQuizzes(res.quizzes || []);
      setLeaderboard(res.leaderboard || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createAdminQuiz({
      titleKn: newQuiz.titleKn,
      titleEn: newQuiz.titleEn || newQuiz.titleKn,
      descriptionKn: newQuiz.descriptionKn,
      descriptionEn: newQuiz.descriptionKn,
      scheduleType: newQuiz.scheduleType,
      active: true,
      questions: [
        {
          id: 'q1',
          questionKn: newQuiz.questionKn,
          questionEn: newQuiz.questionKn,
          options: [
            { kn: newQuiz.opt0, en: newQuiz.opt0 },
            { kn: newQuiz.opt1, en: newQuiz.opt1 },
            { kn: newQuiz.opt2, en: newQuiz.opt2 },
            { kn: newQuiz.opt3, en: newQuiz.opt3 },
          ],
          correctIndex: newQuiz.correctIndex,
        },
      ],
    });
    setFeedback('New quiz created and published live.');
    setNewQuiz({
      titleKn: '',
      titleEn: '',
      descriptionKn: '',
      scheduleType: 'daily',
      questionKn: '',
      opt0: '',
      opt1: '',
      opt2: '',
      opt3: '',
      correctIndex: 0,
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Games, Quizzes & Community Leaderboard
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Create interactive Malnad & Kannada quizzes, toggle daily/weekly availability, and review player participation scores.
        </p>
      </div>

      {feedback && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-800">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <form
          onSubmit={handleCreate}
          className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 text-xs"
        >
          <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
            <Plus className="w-4 h-4 text-[#176B4A]" />
            <span>Create Quick Malnad Quiz</span>
          </div>
          <input
            required
            value={newQuiz.titleKn}
            onChange={(e) => setNewQuiz({ ...newQuiz, titleKn: e.target.value })}
            placeholder="Quiz Title (Kannada or English)"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
          />
          <input
            value={newQuiz.descriptionKn}
            onChange={(e) => setNewQuiz({ ...newQuiz, descriptionKn: e.target.value })}
            placeholder="Short description"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
          />
          <select
            value={newQuiz.scheduleType}
            onChange={(e) => setNewQuiz({ ...newQuiz, scheduleType: e.target.value })}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
          >
            <option value="daily">Daily Challenge</option>
            <option value="weekly">Weekly Challenge</option>
            <option value="always">Always Available</option>
          </select>
          <input
            required
            value={newQuiz.questionKn}
            onChange={(e) => setNewQuiz({ ...newQuiz, questionKn: e.target.value })}
            placeholder="Question 1"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              value={newQuiz.opt0}
              onChange={(e) => setNewQuiz({ ...newQuiz, opt0: e.target.value })}
              placeholder="Option 1"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5"
            />
            <input
              required
              value={newQuiz.opt1}
              onChange={(e) => setNewQuiz({ ...newQuiz, opt1: e.target.value })}
              placeholder="Option 2"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5"
            />
            <input
              required
              value={newQuiz.opt2}
              onChange={(e) => setNewQuiz({ ...newQuiz, opt2: e.target.value })}
              placeholder="Option 3"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5"
            />
            <input
              required
              value={newQuiz.opt3}
              onChange={(e) => setNewQuiz({ ...newQuiz, opt3: e.target.value })}
              placeholder="Option 4"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5"
            />
          </div>
          <select
            value={newQuiz.correctIndex}
            onChange={(e) => setNewQuiz({ ...newQuiz, correctIndex: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2"
          >
            <option value={0}>Correct Answer: Option 1</option>
            <option value={1}>Correct Answer: Option 2</option>
            <option value={2}>Correct Answer: Option 3</option>
            <option value={3}>Correct Answer: Option 4</option>
          </select>
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-[#176B4A] text-white font-bold cursor-pointer"
          >
            Publish Quiz
          </button>
        </form>

        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Gamepad2 className="w-4 h-4 text-[#176B4A]" />
              <span>Configured Quizzes ({quizzes.length})</span>
            </div>
            {loading ? (
              <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            ) : (
              quizzes.map((q) => (
                <div
                  key={q.id}
                  className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold font-kannada text-slate-900 dark:text-white">
                      {q.titleKn}
                    </div>
                    <div className="text-slate-500">
                      {q.questions.length} questions · {q.scheduleType} ·{' '}
                      {q.active ? 'Active' : 'Disabled'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await updateAdminQuiz(q.id, { active: !q.active });
                        await load();
                      }}
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer"
                    >
                      {q.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteAdminQuiz(q.id);
                        await load();
                      }}
                      className="p-1 text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Top Leaderboard Entries ({leaderboard.length})</span>
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-slate-500">No player submissions yet.</p>
            ) : (
              leaderboard.slice(0, 10).map((e, i) => (
                <div key={e.id} className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span>
                    #{i + 1} <strong>{e.playerName}</strong> ({e.location})
                  </span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    {e.score}/{e.total} ({e.durationSec}s)
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
