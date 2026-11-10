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
    return { expired: true, text: '00:00 (মেয়াদ শেষ)', secondsLeft: 0 };
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
      const message = err instanceof Error ? err.message : 'সার্ভারের সাথে সংযোগ বিচ্ছিন্ন হয়েছে৷';
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
      showNotice('error', 'অনুগ্রহ করে উপরে শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন (Please enter 17-digit Birth Registration Number)৷');
      return null;
    }
    if (!/^\d{17}$/.test(trimmed)) {
      showNotice('error', 'জন্ম নিবন্ধন নম্বর অবশ্যই ১৭ অঙ্কের সংখ্যা হতে হবে (e.g. 20152691234567890)৷');
      return null;
    }
    return trimmed;
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = classNameInput.trim();
    const seats = Number(totalSeatsInput);

    if (!trimmedName) {
      showNotice('error', 'Class-এর নাম খালি রাখা যাবে না (Class Name is required)৷');
      return;
    }
    if (!Number.isInteger(seats) || seats <= 0) {
      showNotice('error', 'মোট আসন সংখ্যা ১ বা তার বেশি হতে হবে (Total seats must be > 0)৷');
      return;
    }

    setLoadingAction('create-class');
    try {
      const created = await api.createClass(trimmedName, seats);
      setClassNameInput('');
      setTotalSeatsInput('120');
      showNotice('success', `"${created.name}" (${created.totalSeats} seats) সফলভাবে তৈরি হয়েছে!`);
      await fetchAllData(studentId);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Class তৈরি করা সম্ভব হয়নি৷');
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
      showNotice('success', `"${cls.name}"-এ আপনার আসন সাময়িকভাবে hold করা হয়েছে৷ সময়ের মধ্যে ভর্তি ফি দিন৷`);
      await fetchAllData(validId);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'আবেদন সম্পন্ন করা যায়নি৷');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleConfirmHold = async (hold: MyHoldItem) => {
    const validId = validateStudentId();
    if (!validId) return;

    const effectiveStatus = getEffectiveStatus(hold);
    if (effectiveStatus !== 'HELD') {
      showNotice('error', 'এই আবেদনের মেয়াদ শেষ হয়ে গেছে৷');
      return;
    }

    setLoadingAction(`confirm-${hold.holdId}`);
    try {
      await api.confirmHold(hold.holdId, validId);
      showNotice('success', `অভিনন্দন! "${hold.className}"-এ আপনার ভর্তি নিশ্চিত (CONFIRMED) হয়েছে৷`);
      await fetchAllData(validId);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'ভর্তি নিশ্চিত করা যায়নি৷');
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
      showNotice('success', `"${hold.className}"-এর আবেদন বাতিল (CANCELLED) করা হয়েছে৷`);
      await fetchAllData(validId);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'আবেদন বাতিল করা যায়নি৷');
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
              অনলাইন স্কুল ভর্তি সিস্টেম (School Admission System)
            </h1>
            <p className="text-xs text-indigo-200 mt-0.5">
              আগে আবেদন করলে আগে পাবে ভিত্তিতে ভর্তি ? API: {API_BASE_URL}
            </p>
          </div>

          <div className="bg-indigo-950/80 border border-indigo-700 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="flex-1">
              <label htmlFor="student-id-input" className="block text-xs font-medium text-indigo-200 mb-1">
                শিক্ষার্থীর জন্ম নিবন্ধন নম্বর (১৭ অঙ্ক / X-Student-Id)
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
              নমুনা নম্বর বসান
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-6 space-y-6">
        {serverOffline && (
          <div role="alert" className="bg-rose-50 border-l-4 border-rose-600 p-4 rounded-lg shadow-sm flex items-center justify-between">
            <div>
              <p className="font-bold text-rose-900">সার্ভার বন্ধ বা সংযোগ বিচ্ছিন্ন (Server Offline)</p>
              <p className="text-sm text-rose-700">
                ব্যাকএন্ড সার্ভার ({API_BASE_URL})-এর সাথে যোগাযোগ করা যাচ্ছে না৷
              </p>
            </div>
            <button
              onClick={() => fetchAllData(studentId)}
              className="px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700"
            >
              পুনরায় চেষ্টা করুন
            </button>
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="bg-rose-50 border border-rose-300 text-rose-900 px-4 py-3 rounded-xl shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-rose-600 font-bold">ত্রুটি:</span>
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs font-bold text-rose-700 hover:underline ml-4"
            >
              বন্ধ করুন ?
            </button>
          </div>
        )}

        {successMessage && (
          <div role="status" className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-emerald-600 font-bold">সফল:</span>
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-xs font-bold text-emerald-700 hover:underline ml-4"
            >
              বন্ধ করুন ?
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Screen 1: Class তৈরি (School Admin) */}
          <section className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                School Admin
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-1">Class তৈরি (school admin)</h2>
              <p className="text-xs text-slate-500">
                Class-এর নাম আর seat সংখ্যা দিয়ে নতুন class তৈরি করুন
              </p>
            </div>

            <form onSubmit={handleCreateClass} className="space-y-4">
              <div>
                <label htmlFor="class-name-input" className="block text-sm font-medium text-slate-700 mb-1">
                  Class-এর নাম (Class & Shift Name)
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
                  মোট Seat সংখ্যা (Total Seats)
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
                {loadingAction === 'create-class' ? 'তৈরি হচ্ছে...' : 'Class তৈরি করুন'}
              </button>
            </form>
          </section>

          {/* Screen 3: আবেদন */}
          <section className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
            <div>
              <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                    আবেদন (Application)
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">আবেদনের অবস্থা ও সময়সীমা</h2>
                </div>
                {activeHold && statusBadge(getEffectiveStatus(activeHold))}
              </div>

              {!activeHold ? (
                <div className="py-10 text-center text-slate-500 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  বর্তমানে কোনো নির্বাচিত আবেদন নেই৷ নিচের <strong>Class তালিকা</strong> থেকে <strong>"আবেদন করুন"</strong> বাটনে চাপুন৷
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
                          <p className="text-xs text-slate-500">Class-এর নাম</p>
                          <p className="text-base font-bold text-slate-900">{activeHold.className || activeHold.classId}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Hold ID</p>
                          <p className="text-sm font-mono font-semibold text-slate-800">{activeHold.holdId}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">অবস্থা (Status)</p>
                          <div className="mt-1">{statusBadge(effectiveStatus)}</div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">মেয়াদ শেষ হতে কত সময় বাকি</p>
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
                              ? 'CONFIRMED (ভর্তি নিশ্চিত)'
                              : effectiveStatus === 'CANCELLED'
                              ? 'CANCELLED (বাতিল)'
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
                          {loadingAction === `confirm-${activeHold.holdId}` ? 'নিশ্চিত হচ্ছে...' : 'ভর্তি ফি দিন'}
                        </button>

                        <button
                          type="button"
                          disabled={!canCancel || loadingAction === `cancel-${activeHold.holdId}`}
                          onClick={() => handleCancelHold(activeHold)}
                          className="py-2.5 px-4 rounded-lg font-semibold text-sm text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed transition"
                        >
                          {loadingAction === `cancel-${activeHold.holdId}` ? 'বাতিল হচ্ছে...' : 'বাতিল'}
                        </button>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </section>
        </div>

        {/* Screen 2: Class তালিকা */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Class তালিকা</h2>
              <p className="text-xs text-slate-500">
                প্রতিটা class-এর মোট, hold-এ থাকা, নিশ্চিত আর খালি seat (স্বয়ংক্রিয় হালনাগাদ)
              </p>
            </div>
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              ? Live Auto-Refresh
            </span>
          </div>

          {classes.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              এখনো কোনো Class তৈরি করা হয়নি৷ উপরের ফর্ম থেকে নতুন Class তৈরি করুন৷
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase bg-slate-50">
                    <th className="py-3 px-4">Class-এর নাম</th>
                    <th className="py-3 px-4 text-center">মোট (Total)</th>
                    <th className="py-3 px-4 text-center">Hold-এ থাকা (Held)</th>
                    <th className="py-3 px-4 text-center">নিশ্চিত (Confirmed)</th>
                    <th className="py-3 px-4 text-center">খালি (Available)</th>
                    <th className="py-3 px-4 text-right">আবেদন</th>
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
                          {loadingAction === `hold-${cls.id}` ? 'অপেক্ষা করুন...' : 'আবেদন করুন'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Screen 4: আমার আবেদন */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="border-b border-slate-100 pb-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">আমার আবেদন (My Applications)</h2>
              <p className="text-xs text-slate-500">
                শিক্ষার্থীর জন্ম নিবন্ধন নম্বর: <span className="font-mono font-semibold text-slate-700">{studentId || 'N/A'}</span>
              </p>
            </div>
          </div>

          {!studentId.trim() ? (
            <div className="py-6 text-center text-slate-500 text-sm">
              নিজের আবেদন দেখতে উপরে ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন৷
            </div>
          ) : myHolds.length === 0 ? (
            <div className="py-6 text-center text-slate-500 text-sm">
              এই শিক্ষার্থীর এখনো কোনো আবেদন নেই৷
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase bg-slate-50">
                    <th className="py-3 px-4">Class-এর নাম</th>
                    <th className="py-3 px-4">অবস্থা (Status)</th>
                    <th className="py-3 px-4">বাকি সময়</th>
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
                            ভর্তি ফি দিন
                          </button>
                          <button
                            type="button"
                            disabled={!canCancel || loadingAction === `cancel-${hold.holdId}`}
                            onClick={() => handleCancelHold(hold)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed transition"
                          >
                            বাতিল
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
