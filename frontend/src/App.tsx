import React, { useCallback, useEffect, useState } from 'react';
import { api, API_BASE_URL } from './api';
import { ClassSummary, HoldStatus, MyHoldItem } from './types';

const STUDENT_ID_STORAGE_KEY = 'school_admission_student_id';

export function formatRemainingTime(expiresAtIso: string, nowMs: number): {
  expired: boolean;
  text: string;
  secondsLeft: number;
} {
  const targetMs = new Date(expiresAtIso).getTime();
  if (Number.isNaN(targetMs)) {
    return { expired: false, text: '--:--', secondsLeft: 0 };
  }
  const diffSeconds = Math.floor((targetMs - nowMs) / 1000);
  if (diffSeconds <= 0) {
    return { expired: true, text: '00:00 (\u09ae\u09c7\u09df\u09be\u09a6 \u09b6\u09c7\u09b7)', secondsLeft: 0 };
  }
  const mins = Math.floor(diffSeconds / 60);
  const secs = diffSeconds % 60;
  return {
    expired: false,
    text: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
    secondsLeft: diffSeconds
  };
}

export default function App() {
  const [studentId, setStudentId] = useState<string>(() => {
    return localStorage.getItem(STUDENT_ID_STORAGE_KEY) || '';
  });

  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [myHolds, setMyHolds] = useState<MyHoldItem[]>([]);
  const [selectedHoldId, setSelectedHoldId] = useState<string | null>(null);

  const [classNameInput, setClassNameInput] = useState('');
  const [totalSeatsInput, setTotalSeatsInput] = useState('120');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [serverOffline, setServerOffline] = useState<boolean>(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const handleStudentIdChange = (value: string) => {
    const cleaned = value.replace(/\s+/g, '');
    setStudentId(cleaned);
    localStorage.setItem(STUDENT_ID_STORAGE_KEY, cleaned);
  };

  const showNotice = (type: 'error' | 'success', msg: string) => {
    if (type === 'error') {
      setErrorMessage(msg);
      setSuccessMessage(null);
    } else {
      setSuccessMessage(msg);
      setErrorMessage(null);
    }
  };

  const fetchAllData = useCallback(async (currentStudentId: string) => {
    try {
      const classList = await api.getClasses();
      setClasses(classList);
      setServerOffline(false);

      if (currentStudentId.trim().length > 0) {
        const holds = await api.getMyHolds(currentStudentId.trim());
        setMyHolds(holds);
      } else {
        setMyHolds([]);
      }
    } catch (err) {
      setServerOffline(true);
      const message = err instanceof Error ? err.message : '\u09b8\u09be\u09b0\u09cd\u09ad\u09be\u09b0\u09c7\u09b0 \u09b8\u09be\u09a5\u09c7 \u09b8\u0982\u09af\u09cb\u0997 \u09ac\u09bf\u099a\u09cd\u099b\u09bf\u09a8\u09cd\u09a8 \u09b9\u09df\u09c7\u099b\u09c7\u09f7';
      setErrorMessage(message);
    }
  }, []);

  useEffect(() => {
    fetchAllData(studentId);
    const interval = setInterval(() => {
      fetchAllData(studentId);
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchAllData, studentId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getEffectiveStatus = (hold: MyHoldItem): HoldStatus => {
    if (hold.status === 'HELD') {
      const { expired } = formatRemainingTime(hold.expiresAt, nowMs);
      if (expired) {
        return 'EXPIRED';
      }
    }
    return hold.status;
  };

  const validateStudentId = (): string | null => {
    const trimmed = studentId.trim();
    if (!trimmed) {
      showNotice('error', '\u0985\u09a8\u09c1\u0997\u09cd\u09b0\u09b9 \u0995\u09b0\u09c7 \u0989\u09aa\u09b0\u09c7 \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0\u09b0 \u09e7\u09ed \u0985\u0999\u09cd\u0995\u09c7\u09b0 \u099c\u09a8\u09cd\u09ae \u09a8\u09bf\u09ac\u09a8\u09cd\u09a7\u09a8 \u09a8\u09ae\u09cd\u09ac\u09b0 \u09b2\u09bf\u0996\u09c1\u09a8 (Please enter 17-digit Birth Registration Number)\u09f7');
      return null;
    }
    if (!/^\d{17}$/.test(trimmed)) {
      showNotice('error', '\u099c\u09a8\u09cd\u09ae \u09a8\u09bf\u09ac\u09a8\u09cd\u09a7\u09a8 \u09a8\u09ae\u09cd\u09ac\u09b0 \u0985\u09ac\u09b6\u09cd\u09af\u0987 \u09e7\u09ed \u0985\u0999\u09cd\u0995\u09c7\u09b0 \u09b8\u0982\u0996\u09cd\u09af\u09be \u09b9\u09a4\u09c7 \u09b9\u09ac\u09c7 (e.g. 20152691234567890)\u09f7');
      return null;
    }
    return trimmed;
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = classNameInput.trim();
    const seats = Number(totalSeatsInput);

    if (!trimmedName) {
      showNotice('error', 'Class-\u098f\u09b0 \u09a8\u09be\u09ae \u0996\u09be\u09b2\u09bf \u09b0\u09be\u0996\u09be \u09af\u09be\u09ac\u09c7 \u09a8\u09be (Class Name is required)\u09f7');
      return;
    }
    if (!Number.isInteger(seats) || seats <= 0) {
      showNotice('error', '\u09ae\u09cb\u099f \u0986\u09b8\u09a8 \u09b8\u0982\u0996\u09cd\u09af\u09be \u09e7 \u09ac\u09be \u09a4\u09be\u09b0 \u09ac\u09c7\u09b6\u09bf \u09b9\u09a4\u09c7 \u09b9\u09ac\u09c7 (Total seats must be > 0)\u09f7');
      return;
    }

    setLoadingAction('create-class');
    try {
      const created = await api.createClass(trimmedName, seats);
      setClassNameInput('');
      setTotalSeatsInput('120');
      showNotice('success', `"${created.name}" (${created.totalSeats} seats) \u09b8\u09ab\u09b2\u09ad\u09be\u09ac\u09c7 \u09a4\u09c8\u09b0\u09bf \u09b9\u09df\u09c7\u099b\u09c7!`);
      await fetchAllData(studentId);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Class \u09a4\u09c8\u09b0\u09bf \u0995\u09b0\u09be \u09b8\u09ae\u09cd\u09ad\u09ac \u09b9\u09df\u09a8\u09bf\u09f7');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleApplyHold = async (cls: ClassSummary) => {
    const validId = validateStudentId();
    if (!validId) return;

    setLoadingAction(`hold-${cls.id}`);
    try {
      const createdHold = await api.createHold(cls.id, validId);
      setSelectedHoldId(createdHold.holdId);
      showNotice('success', `"${cls.name}"-\u098f \u0986\u09aa\u09a8\u09be\u09b0 \u0986\u09b8\u09a8 \u09b8\u09be\u09ae\u09df\u09bf\u0995\u09ad\u09be\u09ac\u09c7 hold \u0995\u09b0\u09be \u09b9\u09df\u09c7\u099b\u09c7\u09f7 \u09b8\u09ae\u09df\u09c7\u09b0 \u09ae\u09a7\u09cd\u09af\u09c7 \u09ad\u09b0\u09cd\u09a4\u09bf \u09ab\u09bf \u09a6\u09bf\u09a8\u09f7`);
      await fetchAllData(validId);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : '\u0986\u09ac\u09c7\u09a6\u09a8 \u09b8\u09ae\u09cd\u09aa\u09a8\u09cd\u09a8 \u0995\u09b0\u09be \u09af\u09be\u09df\u09a8\u09bf\u09f7');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleConfirmHold = async (hold: MyHoldItem) => {
    const validId = validateStudentId();
    if (!validId) return;

    const effectiveStatus = getEffectiveStatus(hold);
    if (effectiveStatus !== 'HELD') {
      showNotice('error', '\u098f\u0987 \u0986\u09ac\u09c7\u09a6\u09a8\u09c7\u09b0 \u09ae\u09c7\u09df\u09be\u09a6 \u09b6\u09c7\u09b7 \u09b9\u09df\u09c7 \u0997\u09c7\u099b\u09c7\u09f7');
      return;
    }

    setLoadingAction(`confirm-${hold.holdId}`);
    try {
      await api.confirmHold(hold.holdId, validId);
      showNotice('success', `\u0985\u09ad\u09bf\u09a8\u09a8\u09cd\u09a6\u09a8! "${hold.className}"-\u098f \u0986\u09aa\u09a8\u09be\u09b0 \u09ad\u09b0\u09cd\u09a4\u09bf \u09a8\u09bf\u09b6\u09cd\u099a\u09bf\u09a4 (CONFIRMED) \u09b9\u09df\u09c7\u099b\u09c7\u09f7`);
      await fetchAllData(validId);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : '\u09ad\u09b0\u09cd\u09a4\u09bf \u09a8\u09bf\u09b6\u09cd\u099a\u09bf\u09a4 \u0995\u09b0\u09be \u09af\u09be\u09df\u09a8\u09bf\u09f7');
      await fetchAllData(validId);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancelHold = async (hold: MyHoldItem) => {
    const validId = validateStudentId();
    if (!validId) return;

    setLoadingAction(`cancel-${hold.holdId}`);
    try {
      await api.cancelHold(hold.holdId, validId);
      showNotice('success', `"${hold.className}"-\u098f\u09b0 \u0986\u09ac\u09c7\u09a6\u09a8 \u09ac\u09be\u09a4\u09bf\u09b2 (CANCELLED) \u0995\u09b0\u09be \u09b9\u09df\u09c7\u099b\u09c7\u09f7`);
      await fetchAllData(validId);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : '\u0986\u09ac\u09c7\u09a6\u09a8 \u09ac\u09be\u09a4\u09bf\u09b2 \u0995\u09b0\u09be \u09af\u09be\u09df\u09a8\u09bf\u09f7');
      await fetchAllData(validId);
    } finally {
      setLoadingAction(null);
    }
  };

  const activeHold =
    myHolds.find((h) => h.holdId === selectedHoldId) ||
    myHolds.find((h) => getEffectiveStatus(h) === 'HELD') ||
    myHolds[0] ||
    null;

  const statusBadge = (status: HoldStatus) => {
    switch (status) {
      case 'HELD':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">HELD</span>;
      case 'CONFIRMED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">CONFIRMED</span>;
      case 'EXPIRED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">EXPIRED</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700">CANCELLED</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="bg-indigo-900 text-white shadow-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              \u0985\u09a8\u09b2\u09be\u0987\u09a8 \u09b8\u09cd\u0995\u09c1\u09b2 \u09ad\u09b0\u09cd\u09a4\u09bf \u09b8\u09bf\u09b8\u09cd\u099f\u09c7\u09ae (School Admission System)
            </h1>
            <p className="text-xs text-indigo-200 mt-0.5">
              \u0986\u0997\u09c7 \u0986\u09ac\u09c7\u09a6\u09a8 \u0995\u09b0\u09b2\u09c7 \u0986\u0997\u09c7 \u09aa\u09be\u09ac\u09c7 \u09ad\u09bf\u09a4\u09cd\u09a4\u09bf\u09a4\u09c7 \u09ad\u09b0\u09cd\u09a4\u09bf ? API: {API_BASE_URL}
            </p>
          </div>

          <div className="bg-indigo-950/80 border border-indigo-700 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="flex-1">
              <label htmlFor="student-id-input" className="block text-xs font-medium text-indigo-200 mb-1">
                \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0\u09b0 \u099c\u09a8\u09cd\u09ae \u09a8\u09bf\u09ac\u09a8\u09cd\u09a7\u09a8 \u09a8\u09ae\u09cd\u09ac\u09b0 (\u09e7\u09ed \u0985\u0999\u09cd\u0995 / X-Student-Id)
              </label>
              <input
                id="student-id-input"
                type="text"
                maxLength={17}
                value={studentId}
                onChange={(e) => handleStudentIdChange(e.target.value)}
                placeholder="20152691234567890"
                className="w-full sm:w-64 px-3 py-1.5 rounded-lg bg-white text-slate-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <button
              type="button"
              onClick={() => handleStudentIdChange('20152691234567890')}
              className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-2.5 py-2 rounded-lg font-medium transition self-end sm:self-center"
            >
              \u09a8\u09ae\u09c1\u09a8\u09be \u09a8\u09ae\u09cd\u09ac\u09b0 \u09ac\u09b8\u09be\u09a8
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-6 space-y-6">
        {serverOffline && (
          <div role="alert" className="bg-rose-50 border-l-4 border-rose-600 p-4 rounded-lg shadow-sm flex items-center justify-between">
            <div>
              <p className="font-bold text-rose-900">\u09b8\u09be\u09b0\u09cd\u09ad\u09be\u09b0 \u09ac\u09a8\u09cd\u09a7 \u09ac\u09be \u09b8\u0982\u09af\u09cb\u0997 \u09ac\u09bf\u099a\u09cd\u099b\u09bf\u09a8\u09cd\u09a8 (Server Offline)</p>
              <p className="text-sm text-rose-700">
                \u09ac\u09cd\u09af\u09be\u0995\u098f\u09a8\u09cd\u09a1 \u09b8\u09be\u09b0\u09cd\u09ad\u09be\u09b0 ({API_BASE_URL})-\u098f\u09b0 \u09b8\u09be\u09a5\u09c7 \u09af\u09cb\u0997\u09be\u09af\u09cb\u0997 \u0995\u09b0\u09be \u09af\u09be\u099a\u09cd\u099b\u09c7 \u09a8\u09be\u09f7
              </p>
            </div>
            <button
              onClick={() => fetchAllData(studentId)}
              className="px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700"
            >
              \u09aa\u09c1\u09a8\u09b0\u09be\u09df \u099a\u09c7\u09b7\u09cd\u099f\u09be \u0995\u09b0\u09c1\u09a8
            </button>
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="bg-rose-50 border border-rose-300 text-rose-900 px-4 py-3 rounded-xl shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-rose-600 font-bold">\u09a4\u09cd\u09b0\u09c1\u099f\u09bf:</span>
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs font-bold text-rose-700 hover:underline ml-4"
            >
              \u09ac\u09a8\u09cd\u09a7 \u0995\u09b0\u09c1\u09a8 ?
            </button>
          </div>
        )}

        {successMessage && (
          <div role="status" className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-emerald-600 font-bold">\u09b8\u09ab\u09b2:</span>
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-xs font-bold text-emerald-700 hover:underline ml-4"
            >
              \u09ac\u09a8\u09cd\u09a7 \u0995\u09b0\u09c1\u09a8 ?
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Screen 1: Class \u09a4\u09c8\u09b0\u09bf (School Admin) */}
          <section className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                School Admin
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-1">Class \u09a4\u09c8\u09b0\u09bf (school admin)</h2>
              <p className="text-xs text-slate-500">
                Class-\u098f\u09b0 \u09a8\u09be\u09ae \u0986\u09b0 seat \u09b8\u0982\u0996\u09cd\u09af\u09be \u09a6\u09bf\u09df\u09c7 \u09a8\u09a4\u09c1\u09a8 class \u09a4\u09c8\u09b0\u09bf \u0995\u09b0\u09c1\u09a8
              </p>
            </div>

            <form onSubmit={handleCreateClass} className="space-y-4">
              <div>
                <label htmlFor="class-name-input" className="block text-sm font-medium text-slate-700 mb-1">
                  Class-\u098f\u09b0 \u09a8\u09be\u09ae (Class & Shift Name)
                </label>
                <input
                  id="class-name-input"
                  type="text"
                  value={classNameInput}
                  onChange={(e) => setClassNameInput(e.target.value)}
                  placeholder="Class 6 - Morning Shift"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="total-seats-input" className="block text-sm font-medium text-slate-700 mb-1">
                  \u09ae\u09cb\u099f Seat \u09b8\u0982\u0996\u09cd\u09af\u09be (Total Seats)
                </label>
                <input
                  id="total-seats-input"
                  type="number"
                  min={1}
                  value={totalSeatsInput}
                  onChange={(e) => setTotalSeatsInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={loadingAction === 'create-class'}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold rounded-lg text-sm shadow-sm transition"
              >
                {loadingAction === 'create-class' ? '\u09a4\u09c8\u09b0\u09bf \u09b9\u099a\u09cd\u099b\u09c7...' : 'Class \u09a4\u09c8\u09b0\u09bf \u0995\u09b0\u09c1\u09a8'}
              </button>
            </form>
          </section>

          {/* Screen 3: \u0986\u09ac\u09c7\u09a6\u09a8 */}
          <section className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                    \u0986\u09ac\u09c7\u09a6\u09a8 (Application)
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">\u0986\u09ac\u09c7\u09a6\u09a8\u09c7\u09b0 \u0985\u09ac\u09b8\u09cd\u09a5\u09be \u0993 \u09b8\u09ae\u09df\u09b8\u09c0\u09ae\u09be</h2>
                </div>
                {activeHold && statusBadge(getEffectiveStatus(activeHold))}
              </div>

              {!activeHold ? (
                <div className="py-10 text-center text-slate-500 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  \u09ac\u09b0\u09cd\u09a4\u09ae\u09be\u09a8\u09c7 \u0995\u09cb\u09a8\u09cb \u09a8\u09bf\u09b0\u09cd\u09ac\u09be\u099a\u09bf\u09a4 \u0986\u09ac\u09c7\u09a6\u09a8 \u09a8\u09c7\u0987\u09f7 \u09a8\u09bf\u099a\u09c7\u09b0 <strong>Class \u09a4\u09be\u09b2\u09bf\u0995\u09be</strong> \u09a5\u09c7\u0995\u09c7 <strong>"\u0986\u09ac\u09c7\u09a6\u09a8 \u0995\u09b0\u09c1\u09a8"</strong> \u09ac\u09be\u099f\u09a8\u09c7 \u099a\u09be\u09aa\u09c1\u09a8\u09f7
                </div>
              ) : (
                (() => {
                  const effectiveStatus = getEffectiveStatus(activeHold);
                  const timer = formatRemainingTime(activeHold.expiresAt, nowMs);
                  const canConfirm = effectiveStatus === 'HELD' && !timer.expired;
                  const canCancel = effectiveStatus === 'HELD' && !timer.expired;

                  return (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div>
                          <p className="text-xs text-slate-500">Class-\u098f\u09b0 \u09a8\u09be\u09ae</p>
                          <p className="text-base font-bold text-slate-900">{activeHold.className || activeHold.classId}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Hold ID</p>
                          <p className="text-sm font-mono font-semibold text-slate-800">{activeHold.holdId}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">\u0985\u09ac\u09b8\u09cd\u09a5\u09be (Status)</p>
                          <div className="mt-1">{statusBadge(effectiveStatus)}</div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">\u09ae\u09c7\u09df\u09be\u09a6 \u09b6\u09c7\u09b7 \u09b9\u09a4\u09c7 \u0995\u09a4 \u09b8\u09ae\u09df \u09ac\u09be\u0995\u09bf</p>
                          <p
                            data-testid="active-hold-timer"
                            className={`text-lg font-mono font-bold ${
                              effectiveStatus === 'CONFIRMED'
                                ? 'text-emerald-700'
                                : effectiveStatus === 'EXPIRED'
                                ? 'text-rose-600'
                                : 'text-amber-700'
                            }`}
                          >
                            {effectiveStatus === 'CONFIRMED'
                              ? 'CONFIRMED (\u09ad\u09b0\u09cd\u09a4\u09bf \u09a8\u09bf\u09b6\u09cd\u099a\u09bf\u09a4)'
                              : effectiveStatus === 'CANCELLED'
                              ? 'CANCELLED (\u09ac\u09be\u09a4\u09bf\u09b2)'
                              : timer.text}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                          type="button"
                          disabled={!canConfirm || loadingAction === `confirm-${activeHold.holdId}`}
                          onClick={() => handleConfirmHold(activeHold)}
                          className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition shadow-sm"
                        >
                          {loadingAction === `confirm-${activeHold.holdId}` ? '\u09a8\u09bf\u09b6\u09cd\u099a\u09bf\u09a4 \u09b9\u099a\u09cd\u099b\u09c7...' : '\u09ad\u09b0\u09cd\u09a4\u09bf \u09ab\u09bf \u09a6\u09bf\u09a8'}
                        </button>

                        <button
                          type="button"
                          disabled={!canCancel || loadingAction === `cancel-${activeHold.holdId}`}
                          onClick={() => handleCancelHold(activeHold)}
                          className="py-2.5 px-4 rounded-lg font-semibold text-sm text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed transition"
                        >
                          {loadingAction === `cancel-${activeHold.holdId}` ? '\u09ac\u09be\u09a4\u09bf\u09b2 \u09b9\u099a\u09cd\u099b\u09c7...' : '\u09ac\u09be\u09a4\u09bf\u09b2'}
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </section>
        </div>

        {/* Screen 2: Class \u09a4\u09be\u09b2\u09bf\u0995\u09be */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Class \u09a4\u09be\u09b2\u09bf\u0995\u09be</h2>
              <p className="text-xs text-slate-500">
                \u09aa\u09cd\u09b0\u09a4\u09bf\u099f\u09be class-\u098f\u09b0 \u09ae\u09cb\u099f, hold-\u098f \u09a5\u09be\u0995\u09be, \u09a8\u09bf\u09b6\u09cd\u099a\u09bf\u09a4 \u0986\u09b0 \u0996\u09be\u09b2\u09bf seat (\u09b8\u09cd\u09ac\u09df\u0982\u0995\u09cd\u09b0\u09bf\u09df \u09b9\u09be\u09b2\u09a8\u09be\u0997\u09be\u09a6)
              </p>
            </div>
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              ? Live Auto-Refresh
            </span>
          </div>

          {classes.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              \u098f\u0996\u09a8\u09cb \u0995\u09cb\u09a8\u09cb Class \u09a4\u09c8\u09b0\u09bf \u0995\u09b0\u09be \u09b9\u09df\u09a8\u09bf\u09f7 \u0989\u09aa\u09b0\u09c7\u09b0 \u09ab\u09b0\u09cd\u09ae \u09a5\u09c7\u0995\u09c7 \u09a8\u09a4\u09c1\u09a8 Class \u09a4\u09c8\u09b0\u09bf \u0995\u09b0\u09c1\u09a8\u09f7
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase bg-slate-50">
                    <th className="py-3 px-4">Class-\u098f\u09b0 \u09a8\u09be\u09ae</th>
                    <th className="py-3 px-4 text-center">\u09ae\u09cb\u099f (Total)</th>
                    <th className="py-3 px-4 text-center">Hold-\u098f \u09a5\u09be\u0995\u09be (Held)</th>
                    <th className="py-3 px-4 text-center">\u09a8\u09bf\u09b6\u09cd\u099a\u09bf\u09a4 (Confirmed)</th>
                    <th className="py-3 px-4 text-center">\u0996\u09be\u09b2\u09bf (Available)</th>
                    <th className="py-3 px-4 text-right">\u0986\u09ac\u09c7\u09a6\u09a8</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {classes.map((cls) => (
                    <tr key={cls.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {cls.name}
                        <span className="block text-xs font-mono text-slate-400">{cls.id}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-800">{cls.totalSeats}</td>
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-amber-700">{cls.heldSeats}</td>
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-emerald-700">{cls.confirmedSeats}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-mono font-bold text-xs ${
                            cls.availableSeats > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {cls.availableSeats}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          disabled={loadingAction === `hold-${cls.id}`}
                          onClick={() => handleApplyHold(cls)}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm ${
                            cls.availableSeats > 0
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                          }`}
                        >
                          {loadingAction === `hold-${cls.id}` ? '\u0985\u09aa\u09c7\u0995\u09cd\u09b7\u09be \u0995\u09b0\u09c1\u09a8...' : '\u0986\u09ac\u09c7\u09a6\u09a8 \u0995\u09b0\u09c1\u09a8'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Screen 4: \u0986\u09ae\u09be\u09b0 \u0986\u09ac\u09c7\u09a6\u09a8 */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="border-b border-slate-100 pb-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">\u0986\u09ae\u09be\u09b0 \u0986\u09ac\u09c7\u09a6\u09a8 (My Applications)</h2>
              <p className="text-xs text-slate-500">
                \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0\u09b0 \u099c\u09a8\u09cd\u09ae \u09a8\u09bf\u09ac\u09a8\u09cd\u09a7\u09a8 \u09a8\u09ae\u09cd\u09ac\u09b0: <span className="font-mono font-semibold text-slate-700">{studentId || 'N/A'}</span>
              </p>
            </div>
          </div>

          {!studentId.trim() ? (
            <div className="py-6 text-center text-slate-500 text-sm">
              \u09a8\u09bf\u099c\u09c7\u09b0 \u0986\u09ac\u09c7\u09a6\u09a8 \u09a6\u09c7\u0996\u09a4\u09c7 \u0989\u09aa\u09b0\u09c7 \u09e7\u09ed \u0985\u0999\u09cd\u0995\u09c7\u09b0 \u099c\u09a8\u09cd\u09ae \u09a8\u09bf\u09ac\u09a8\u09cd\u09a7\u09a8 \u09a8\u09ae\u09cd\u09ac\u09b0 \u09b2\u09bf\u0996\u09c1\u09a8\u09f7
            </div>
          ) : myHolds.length === 0 ? (
            <div className="py-6 text-center text-slate-500 text-sm">
              \u098f\u0987 \u09b6\u09bf\u0995\u09cd\u09b7\u09be\u09b0\u09cd\u09a5\u09c0\u09b0 \u098f\u0996\u09a8\u09cb \u0995\u09cb\u09a8\u09cb \u0986\u09ac\u09c7\u09a6\u09a8 \u09a8\u09c7\u0987\u09f7
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase bg-slate-50">
                    <th className="py-3 px-4">Class-\u098f\u09b0 \u09a8\u09be\u09ae</th>
                    <th className="py-3 px-4">\u0985\u09ac\u09b8\u09cd\u09a5\u09be (Status)</th>
                    <th className="py-3 px-4">\u09ac\u09be\u0995\u09bf \u09b8\u09ae\u09df</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {myHolds.map((hold) => {
                    const effectiveStatus = getEffectiveStatus(hold);
                    const timer = formatRemainingTime(hold.expiresAt, nowMs);
                    const canConfirm = effectiveStatus === 'HELD' && !timer.expired;
                    const canCancel = effectiveStatus === 'HELD' && !timer.expired;

                    return (
                      <tr
                        key={hold.holdId}
                        onClick={() => setSelectedHoldId(hold.holdId)}
                        className={`cursor-pointer transition ${
                          activeHold?.holdId === hold.holdId ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          {hold.className}
                          <span className="block text-xs font-mono text-slate-400">{hold.holdId}</span>
                        </td>
                        <td className="py-3.5 px-4">{statusBadge(effectiveStatus)}</td>
                        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-700">
                          {effectiveStatus === 'CONFIRMED'
                            ? 'CONFIRMED'
                            : effectiveStatus === 'CANCELLED'
                            ? 'CANCELLED'
                            : timer.text}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={!canConfirm || loadingAction === `confirm-${hold.holdId}`}
                            onClick={() => handleConfirmHold(hold)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition"
                          >
                            \u09ad\u09b0\u09cd\u09a4\u09bf \u09ab\u09bf \u09a6\u09bf\u09a8
                          </button>
                          <button
                            type="button"
                            disabled={!canCancel || loadingAction === `cancel-${hold.holdId}`}
                            onClick={() => handleCancelHold(hold)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed transition"
                          >
                            \u09ac\u09be\u09a4\u09bf\u09b2
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
