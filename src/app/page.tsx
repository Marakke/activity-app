'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { supabase } from '@/lib/supabase';
import AuthForm from '@/components/AuthForm';
import type { User } from '@supabase/supabase-js';

interface ActivityRow {
    id: string;
    name: string;
    emoji: string;
    completedDays: string[];
}

const formatDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const normalizeDateKey = (value: string): string => {
    if (!value) return value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    parsed.setHours(0, 0, 0, 0);
    return formatDateKey(parsed);
};

export default function Home() {
    const [user, setUser] = useState<User | null>(null);
    const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
    const [currentWeek, setCurrentWeek] = useState<Date[]>([]);
    const [newRowName, setNewRowName] = useState<string>('');
    const [newRowEmoji, setNewRowEmoji] = useState<string>('🏃');
    const [showAddRow, setShowAddRow] = useState<boolean>(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [aiAnalysis, setAiAnalysis] = useState<string>('');
    const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState<boolean>(false);
    const [weekCompleted, setWeekCompleted] = useState<boolean>(false);
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [menuOpenRowId, setMenuOpenRowId] = useState<string | null>(null);
    const [needsMigration, setNeedsMigration] = useState<boolean>(false);
    const [isLoadingFromDB, setIsLoadingFromDB] = useState<boolean>(false);

    // Initialize Gemini AI client
    const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '' });

    const emojiLibrary = ['🏃', '🚶', '🏋️', '🚴', '🏊', '🏒', '⚽', '🎾', '🥏', '⛷️', '🕺', '🧹', '❓'];

    // Check auth session on mount
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setIsLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Initialize current week dates
    useEffect(() => {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setHours(0, 0, 0, 0);
        startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Start from Monday

        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            weekDates.push(date);
        }
        setCurrentWeek(weekDates);
    }, []);

    // Load activity rows from Supabase when user is logged in
    useEffect(() => {
        if (user) {
            loadActivityRows();
            checkForMigration();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const loadActivityRows = async () => {
        if (!user) return;

        setIsLoadingFromDB(true);
        const { data, error } = await supabase
            .from('activity_rows')
            .select('*')
            .eq('user_id', user.id)
            .order('order_index', { ascending: true });

        if (error) {
            console.error('Error loading activity rows:', error);
            setActivityRows([]);
            return;
        }

        setActivityRows(
            data.map(row => ({
                id: row.id,
                name: row.name,
                emoji: row.emoji,
                completedDays: (row.completed_days || []).map(normalizeDateKey),
            }))
        );
        setIsLoadingFromDB(false);
    };

    const checkForMigration = async () => {
        if (!user) return;

        // Check if user has data in Supabase already
        const { data } = await supabase.from('activity_rows').select('id').eq('user_id', user.id).limit(1);

        // If no Supabase data but localStorage has data, offer migration
        if (!data || data.length === 0) {
            const savedRows = localStorage.getItem('activityRows');
            if (savedRows) {
                setNeedsMigration(true);
            }
        }
    };

    const migrateLocalStorageData = async () => {
        if (!user) return;

        const savedRows = localStorage.getItem('activityRows');
        if (!savedRows) return;

        try {
            const parsedRows = JSON.parse(savedRows);
            const validRows = parsedRows.map((row: ActivityRow) => ({
                id: row.id,
                name: row.name,
                emoji: row.emoji,
                completedDays: row.completedDays || [],
            }));

            // Migrate each row to Supabase
            for (let i = 0; i < validRows.length; i++) {
                const row = validRows[i];
                const { error } = await supabase.from('activity_rows').upsert(
                    {
                        id: row.id,
                        user_id: user.id,
                        name: row.name,
                        emoji: row.emoji,
                        completed_days: row.completedDays,
                        order_index: i,
                    },
                    { onConflict: 'id' }
                );

                if (error) {
                    console.error('Error migrating row:', error);
                }
            }

            // Migrate AI analyses
            const firstWeekDay = currentWeek[0];
            const currentWeekKey = firstWeekDay ? formatDateKey(firstWeekDay) : undefined;
            const savedAnalysis = currentWeekKey ? localStorage.getItem('ai_analysis_' + currentWeekKey) : null;
            if (currentWeekKey && savedAnalysis) {
                const { error } = await supabase.from('weekly_analyses').upsert(
                    {
                        user_id: user.id,
                        week_start: currentWeekKey,
                        analysis_text: savedAnalysis,
                    },
                    { onConflict: 'user_id,week_start' }
                );

                if (error) {
                    console.error('Error migrating analysis:', error);
                }
            }

            // Clear migration flag and reload
            setNeedsMigration(false);
            loadActivityRows();

            alert('Migration complete! Your data has been saved to the cloud.');
        } catch (error) {
            console.error('Error during migration:', error);
            alert('Migration failed. Please try again.');
        }
    };

    // Save activity rows to Supabase
    useEffect(() => {
        console.log('Save effect triggered:', { user: !!user, rowsLength: activityRows.length, isLoadingFromDB });
        if (user && activityRows.length > 0 && !isLoadingFromDB) {
            activityRows.forEach(async (row, index) => {
                try {
                    console.log('Saving row:', {
                        id: row.id,
                        name: row.name,
                        emoji: row.emoji,
                        completedDays: row.completedDays,
                        user_id: user.id,
                    });
                    const payload = {
                        id: row.id,
                        user_id: user.id,
                        name: row.name,
                        emoji: row.emoji,
                        completed_days: row.completedDays,
                        order_index: index,
                    };
                    console.log('Payload:', JSON.stringify(payload));
                    const { error, data } = await supabase.from('activity_rows').upsert(payload, { onConflict: 'id' });

                    if (error) {
                        console.error('Error saving activity row');
                        console.error('Error object:', error);
                        console.error('Row being saved:', row);
                        console.error('Response data:', data);
                    } else {
                        console.log('Successfully saved row:', row.id);
                    }
                } catch (err) {
                    console.error('Exception saving activity row:', err);
                }
            });
        }
    }, [activityRows, user, isLoadingFromDB]);

    const isActivityCompleted = (rowId: string, date: Date): boolean => {
        const dateStr = formatDateKey(date);
        const row = activityRows.find(row => row.id === rowId);
        if (!row || !row.completedDays) return false;
        return row.completedDays.includes(dateStr);
    };

    const toggleActivityCompletion = (rowId: string, date: Date) => {
        const dateStr = formatDateKey(date);
        setActivityRows(prev => {
            return prev.map(row => {
                if (row.id === rowId) {
                    const isCompleted = row.completedDays.includes(dateStr);
                    if (isCompleted) {
                        return {
                            ...row,
                            completedDays: row.completedDays.filter(day => day !== dateStr),
                        };
                    } else {
                        return {
                            ...row,
                            completedDays: [...row.completedDays, dateStr],
                        };
                    }
                }
                return row;
            });
        });
    };

    const getTotalActivities = (): number => {
        return activityRows.reduce((total, row) => {
            return total + (row.completedDays?.length || 0);
        }, 0);
    };

    const getCurrentStreak = (): number => {
        if (activityRows.length === 0) return 0;

        const allCompletedDays = activityRows.flatMap(row => row.completedDays || []);
        if (allCompletedDays.length === 0) return 0;

        const normalizedDates = new Set(allCompletedDays.map(normalizeDateKey));

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const hasActivityOn = (date: Date) => normalizedDates.has(formatDateKey(date));

        // Streaks must include an activity logged today.
        if (!hasActivityOn(today)) {
            return 0;
        }

        const currentDate = new Date(today);
        let streak = 0;
        const maxDaysToCheck = 365; // Prevent infinite loops

        for (let i = 0; i < maxDaysToCheck; i++) {
            if (hasActivityOn(currentDate)) {
                streak++;
                currentDate.setDate(currentDate.getDate() - 1);
            } else {
                break;
            }
        }

        return streak;
    };

    const getActiveDaysForWeek = (): number => {
        const allCompletedDays = activityRows.flatMap(row => row.completedDays || []);
        const uniqueDates = new Set(allCompletedDays.map(normalizeDateKey));

        // Count only days in the current week
        const weekDates = currentWeek.map(date => formatDateKey(date));
        const activeDaysInWeek = weekDates.filter(dateStr => uniqueDates.has(dateStr));

        return activeDaysInWeek.length;
    };

    const getTotalActivitiesForDay = (date: Date): number => {
        const dateStr = formatDateKey(date);
        return activityRows.reduce((total, row) => {
            return total + (row.completedDays?.includes(dateStr) ? 1 : 0);
        }, 0);
    };

    const isToday = (date: Date): boolean => {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    };

    // Weekly trend functions
    const getWeekStartDate = (date: Date): Date => {
        const startOfWeek = new Date(date);
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Convert to Monday start
        startOfWeek.setDate(date.getDate() + daysToMonday);
        return startOfWeek;
    };

    const getWeeklyTrendData = (): { week: string; count: number }[] => {
        if (activityRows.length === 0) return [];

        // Get all completed dates
        const allCompletedDays = activityRows.flatMap(row => row.completedDays || []);
        if (allCompletedDays.length === 0) return [];

        // Group by week
        const weekGroups: { [key: string]: string[] } = {};

        allCompletedDays.forEach(dateStr => {
            const date = new Date(dateStr);
            const weekStart = getWeekStartDate(date);
            const weekKey = formatDateKey(weekStart);

            if (!weekGroups[weekKey]) {
                weekGroups[weekKey] = [];
            }
            weekGroups[weekKey].push(dateStr);
        });

        // Convert to array and sort by week
        const trendData = Object.entries(weekGroups)
            .map(([week, dates]) => ({
                week: week,
                count: dates.length,
            }))
            .sort((a, b) => a.week.localeCompare(b.week));

        return trendData;
    };

    const getMaxWeeklyCount = (): number => {
        const trendData = getWeeklyTrendData();
        return trendData.length > 0 ? Math.max(...trendData.map(d => d.count)) : 0;
    };

    const getAverageActivitiesPerWeek = (): number => {
        const weeklyData = getWeeklyTrendData();
        if (weeklyData.length === 0) return 0;

        const totalActivities = weeklyData.reduce((sum, week) => sum + week.count, 0);
        const average = totalActivities / weeklyData.length;
        return Math.round(average * 10) / 10;
    };

    const addNewActivityRow = () => {
        if (newRowName.trim()) {
            const newRow: ActivityRow = {
                id: Date.now().toString(),
                name: newRowName.trim(),
                emoji: newRowEmoji,
                completedDays: [],
            };
            setActivityRows(prev => [...prev, newRow]);
            setNewRowName('');
            setNewRowEmoji('🏃');
            setShowAddRow(false);
        }
    };

    const deleteActivityRow = async (rowId: string) => {
        // Allow deleting any activity row (but Total row is not in activityRows)
        setActivityRows(prev => prev.filter(row => row.id !== rowId));
        if (menuOpenRowId === rowId) setMenuOpenRowId(null);

        // Delete from Supabase
        if (user) {
            const { error } = await supabase.from('activity_rows').delete().eq('id', rowId).eq('user_id', user.id);

            if (error) {
                console.error('Error deleting activity row:', error);
                loadActivityRows(); // Reload on error
            }
        }
    };

    const moveRowUp = (rowId: string) => {
        setActivityRows(prev => {
            const index = prev.findIndex(r => r.id === rowId);
            if (index <= 0) return prev;
            const newRows = [...prev];
            const tmp = newRows[index - 1];
            newRows[index - 1] = newRows[index];
            newRows[index] = tmp;
            return newRows;
        });
        setMenuOpenRowId(null);
    };

    const moveRowDown = (rowId: string) => {
        setActivityRows(prev => {
            const index = prev.findIndex(r => r.id === rowId);
            if (index === -1 || index >= prev.length - 1) return prev;
            const newRows = [...prev];
            const tmp = newRows[index + 1];
            newRows[index + 1] = newRows[index];
            newRows[index] = tmp;
            return newRows;
        });
        setMenuOpenRowId(null);
    };

    // Generate AI analysis for the week
    const generateAIAnalysis = async () => {
        if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
            // Fallback analysis if no API key
            const totalActivities = getTotalActivities();
            const activeDays = getActiveDaysForWeek();
            const averagePerWeek = getAverageActivitiesPerWeek();
            const streak = getCurrentStreak();

            const fallbackAnalysis = `This week you completed ${totalActivities} activities across ${activeDays} days. Your average is ${averagePerWeek} activities per week. ${
                streak > 0 ? `You're on a ${streak}-day streak! 🔥` : ''
            } ${activeDays >= 5 ? 'Great consistency!' : 'Keep building those healthy habits!'}`;

            setAiAnalysis(fallbackAnalysis);
            return;
        }

        setIsGeneratingAnalysis(true);

        try {
            const weekData = {
                activities: activityRows.map(row => ({
                    name: row.name,
                    emoji: row.emoji,
                    completedDays: row.completedDays,
                    totalThisWeek: row.completedDays.length,
                })),
                weekStats: {
                    totalActivities: getTotalActivities(),
                    activeDays: getActiveDaysForWeek(),
                    currentStreak: getCurrentStreak(),
                    averagePerWeek: getAverageActivitiesPerWeek(),
                },
                weekRange: `${currentWeek[0]?.toLocaleDateString()} to ${currentWeek[6]?.toLocaleDateString()}`,
            };

            const prompt = `Analyze this week's activity data and provide a brief, motivational summary (2-3 sentences). Focus on patterns, achievements, and encouragement. Be positive and specific about what they accomplished. Data: ${JSON.stringify(weekData)}`;

            // Use the new Google GenAI SDK
            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash-001',
                contents: prompt,
            });

            const analysis = response.text || '';

            setAiAnalysis(analysis);

            // Cache the analysis in Supabase
            if (user) {
                const currentWeekKey = currentWeek[0] ? formatDateKey(currentWeek[0]) : '';
                if (analysis) {
                    await supabase.from('weekly_analyses').upsert(
                        {
                            user_id: user.id,
                            week_start: currentWeekKey,
                            analysis_text: analysis,
                        },
                        { onConflict: 'user_id,week_start' }
                    );

                    // Analysis saved successfully
                }
            }
        } catch (error) {
            console.error('Error generating AI analysis:', error);
            // Fallback to basic analysis
            const totalActivities = getTotalActivities();
            const activeDays = getActiveDaysForWeek();
            const streak = getCurrentStreak();
            setAiAnalysis(
                `This week you completed ${totalActivities} activities across ${activeDays} days. ${
                    streak > 0 ? `You're on a ${streak}-day streak! 🔥 ` : ''
                }Keep up the great work!`
            );
        } finally {
            setIsGeneratingAnalysis(false);
        }
    };

    // Complete the week and generate analysis
    const completeWeek = async () => {
        await generateAIAnalysis();
        setWeekCompleted(true);
    };

    // Load cached analysis from Supabase on component mount
    useEffect(() => {
        if (user) {
            const currentWeekKey = currentWeek[0] ? formatDateKey(currentWeek[0]) : '';
            const loadAnalysis = async () => {
                const { data, error } = await supabase
                    .from('weekly_analyses')
                    .select('analysis_text')
                    .eq('user_id', user.id)
                    .eq('week_start', currentWeekKey)
                    .single();

                if (!error && data) {
                    setAiAnalysis(data.analysis_text);
                }
            };
            loadAnalysis();
        }
    }, [currentWeek, user]);

    // Utility to get ISO week number
    function getISOWeekNumber(date: Date): number {
        const tempDate = new Date(date.getTime());
        tempDate.setHours(0, 0, 0, 0);
        // Thursday in current week decides the year
        tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7));
        // January 4 is always in week 1.
        const week1 = new Date(tempDate.getFullYear(), 0, 4);
        // Adjust to Thursday in week 1 and count number of weeks from date to week1.
        return 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    }

    const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
    useEffect(() => {
        if (menuOpenRowId) {
            const handleClick = (event: MouseEvent) => {
                const menu = menuRefs.current[menuOpenRowId];
                if (menu && !menu.contains(event.target as Node)) {
                    setMenuOpenRowId(null);
                }
            };
            document.addEventListener('mousedown', handleClick);
            return () => {
                document.removeEventListener('mousedown', handleClick);
            };
        }
    }, [menuOpenRowId]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setActivityRows([]);
        setNeedsMigration(false);
    };

    if (isLoading) {
        return (
            <div className='min-h-screen bg-slate-800 flex items-center justify-center'>
                <div className='text-white text-xl'>Loading...</div>
            </div>
        );
    }

    // Show auth form if not logged in
    if (!user) {
        return <AuthForm onAuthSuccess={() => {}} />;
    }

    return (
        <div className='min-h-screen bg-slate-800'>
            <div className='container mx-auto px-4 py-4 sm:py-8 max-w-4xl'>
                {/* Header */}
                <div className='mb-6 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-8'>
                    <div className='hidden sm:block w-36'></div>
                    <div className='text-center max-w-2xl mx-auto'>
                        <h1 className='text-2xl sm:text-4xl font-bold text-white mb-2 sm:mb-3'>Activity Tracker</h1>
                        <p className='text-white text-sm sm:text-lg'>Track your daily activities and stay motivated!</p>
                    </div>
                    <div className='flex flex-col items-end gap-2 sm:w-36'>
                        <Link
                            href='/food-diary'
                            className='w-full inline-flex justify-center items-center gap-2 text-sm sm:text-base text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-2 rounded-lg transition-colors'
                        >
                            <span>Food Diary</span>
                            <span aria-hidden='true'>→</span>
                        </Link>
                        <button
                            onClick={handleLogout}
                            className='self-stretch px-3 py-2 text-slate-400 hover:text-white text-sm transition-colors cursor-pointer border border-transparent rounded-lg flex justify-center'
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {/* Migration Banner */}
                {needsMigration && (
                    <div className='bg-blue-600 rounded-lg p-4 mb-6 text-center'>
                        <p className='text-white mb-2'>
                            We found local data in your browser. Would you like to migrate it to the cloud?
                        </p>
                        <button
                            onClick={migrateLocalStorageData}
                            className='bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors font-medium'
                        >
                            Migrate Data
                        </button>
                        <button
                            onClick={() => setNeedsMigration(false)}
                            className='ml-2 text-blue-100 hover:text-white transition-colors'
                        >
                            Skip
                        </button>
                    </div>
                )}

                {/* Statistics */}
                <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6'>
                    <div className='bg-slate-700 rounded-lg p-4 sm:p-6 shadow-md text-center'>
                        <h3 className='text-sm sm:text-lg font-semibold text-white mb-1 sm:mb-2 text-center'>
                            Total Activities
                        </h3>
                        <p className='text-2xl sm:text-3xl font-bold text-blue-400 text-center'>
                            {getTotalActivities()}
                        </p>
                    </div>
                    <div className='bg-slate-700 rounded-lg p-4 sm:p-6 shadow-md text-center'>
                        <h3 className='text-sm sm:text-lg font-semibold text-white mb-1 sm:mb-2 text-center'>
                            Average per Week
                        </h3>
                        <p className='text-2xl sm:text-3xl font-bold text-green-400 text-center'>
                            {getAverageActivitiesPerWeek()}
                        </p>
                    </div>
                    <div className='bg-slate-700 rounded-lg p-4 sm:p-6 shadow-md text-center'>
                        <h3 className='text-sm sm:text-lg font-semibold text-white mb-1 sm:mb-2 text-center'>
                            Current Streak
                        </h3>
                        <p className='text-2xl sm:text-3xl font-bold text-orange-500 text-center flex items-center justify-center'>
                            {getCurrentStreak()}
                            {getCurrentStreak() > 0 && (
                                <span className='text-lg sm:text-xl ml-1 flex items-center'>🔥</span>
                            )}
                        </p>
                    </div>
                </div>

                {/* Activity Tracking Grid */}
                <div className='bg-slate-700 rounded-lg p-3 sm:p-6 mb-6'>
                    {/* Date Headers */}
                    <div className='grid grid-cols-9 gap-1 sm:gap-2 mb-4 sm:mb-6'>
                        <div></div> {/* Empty cell for emoji column */}
                        {currentWeek.map((date, index) => {
                            const isCurrentDay = isToday(date);
                            return (
                                <div key={index} className='text-center'>
                                    <div
                                        className={`font-medium text-xs sm:text-sm ${
                                            isCurrentDay
                                                ? 'text-blue-400 bg-blue-900/30 px-1 sm:px-2 py-1 rounded'
                                                : 'text-white px-1 sm:px-2 py-1'
                                        }`}
                                    >
                                        <div>{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                                        <div className='text-xs'>
                                            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div></div> {/* Empty cell for delete button column */}
                    </div>

                    {/* Total Row */}
                    <div className='grid grid-cols-9 gap-1 sm:gap-2 items-center mb-4 pb-4 sm:mb-6 sm:pb-6 border-b border-slate-600'>
                        <div className='flex items-center space-x-1 sm:space-x-2'>
                            <span className='text-xl sm:text-2xl'>📊</span>
                            <span className='text-white text-xs sm:text-sm font-medium hidden sm:block'>Total</span>
                        </div>
                        {currentWeek.map((date, index) => {
                            const totalCount = getTotalActivitiesForDay(date);
                            const isCurrentDay = isToday(date);

                            return (
                                <div key={index} className='flex justify-center'>
                                    <div
                                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded flex items-center justify-center text-sm sm:text-base font-bold ${
                                            isCurrentDay ? 'bg-slate-500 border-2 border-blue-400' : 'bg-slate-600'
                                        }`}
                                    >
                                        <span className='text-white'>{totalCount}</span>
                                    </div>
                                </div>
                            );
                        })}
                        <div></div> {/* Empty cell for delete button column */}
                    </div>

                    {/* Activity Rows */}
                    <div className='space-y-4 sm:space-y-6'>
                        {activityRows.map((row, index) => (
                            <div key={row.id} className='grid grid-cols-9 gap-1 sm:gap-2 items-center'>
                                {/* Activity Emoji and Name */}
                                <div className='flex items-center space-x-1 sm:space-x-2'>
                                    <span className='text-xl sm:text-2xl'>{row.emoji}</span>
                                    <span className='text-white text-xs sm:text-sm font-medium hidden sm:block'>
                                        {row.name}
                                    </span>
                                </div>

                                {/* Day Checkboxes */}
                                {currentWeek.map((date, index) => {
                                    const isCompleted = isActivityCompleted(row.id, date);
                                    const isCurrentDay = isToday(date);
                                    const isFutureDate = date > new Date();
                                    const isDisabled = isFutureDate;

                                    return (
                                        <div key={index} className='flex justify-center'>
                                            <button
                                                onClick={() => !isDisabled && toggleActivityCompletion(row.id, date)}
                                                disabled={isDisabled}
                                                className={`w-8 h-8 sm:w-10 sm:h-10 rounded transition-colors cursor-pointer ${
                                                    isCompleted
                                                        ? 'bg-gray-200 hover:bg-gray-300 border-2 border-gray-400'
                                                        : isCurrentDay
                                                          ? 'bg-gray-100 hover:bg-gray-200 border-2 border-blue-400'
                                                          : isDisabled
                                                            ? 'bg-slate-800 cursor-not-allowed opacity-50'
                                                            : 'bg-gray-100 hover:bg-gray-200 border border-gray-300'
                                                }`}
                                            >
                                                {isCompleted && (
                                                    <span className='text-black text-lg sm:text-xl font-bold'>✓</span>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}

                                {/* Delete Button */}
                                <div className='flex justify-center relative'>
                                    <button
                                        onClick={() => setMenuOpenRowId(menuOpenRowId === row.id ? null : row.id)}
                                        className='text-slate-300 py-2 px-3 hover:text-white text-xl font-bold cursor-pointer'
                                        aria-haspopup='menu'
                                        aria-expanded={menuOpenRowId === row.id}
                                        aria-label='Row options'
                                    >
                                        ⋯
                                    </button>
                                    {menuOpenRowId === row.id && (
                                        <div
                                            ref={el => {
                                                menuRefs.current[row.id] = el;
                                            }}
                                            className='absolute z-10 mt-1 right-0 bg-slate-800 border border-slate-700 rounded-md shadow-lg w-40 text-sm'
                                        >
                                            <button
                                                className='w-full text-left px-3 py-2 hover:bg-slate-700 text-red-400 hover:text-red-300 cursor-pointer rounded-t-md'
                                                onClick={() => deleteActivityRow(row.id)}
                                            >
                                                Remove
                                            </button>
                                            <button
                                                className={`w-full text-left px-3 py-2 hover:bg-slate-700 text-white cursor-pointer ${index === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                onClick={() => (index === 0 ? null : moveRowUp(row.id))}
                                                disabled={index === 0}
                                            >
                                                Move up
                                            </button>
                                            <button
                                                className={`w-full text-left px-3 py-2 hover:bg-slate-700 text-white cursor-pointer rounded-b-md ${index === activityRows.length - 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                onClick={() =>
                                                    index === activityRows.length - 1 ? null : moveRowDown(row.id)
                                                }
                                                disabled={index === activityRows.length - 1}
                                            >
                                                Move down
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* No activities message */}
                {activityRows.length === 0 && (
                    <div className='text-center mb-4 sm:mb-6 p-4 bg-slate-700 rounded-lg'>
                        <p className='text-slate-300 text-sm sm:text-base'>
                            <strong>Get started:</strong> Add your first activity row below to begin tracking your daily
                            activities!
                        </p>
                    </div>
                )}

                {/* Add New Row and Complete Week Section */}
                <div className='rounded-lg w-full mx-auto mb-6'>
                    {!showAddRow ? (
                        <div className='mx-auto flex flex-row gap-3'>
                            <button
                                onClick={() => setShowAddRow(true)}
                                className='w-full py-3 px-4 bg-blue-500/80 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium flex items-center justify-center space-x-2 cursor-pointer'
                            >
                                <span>Add new row</span>
                                <span>+</span>
                            </button>
                            <button
                                onClick={async () => {
                                    setShowAnalysis(true);
                                    await completeWeek();
                                }}
                                disabled={isGeneratingAnalysis || weekCompleted}
                                className='w-full py-3 px-4 bg-sky-500/75 text-white rounded-lg hover:bg-sky-500 transition-colors font-medium flex items-center justify-center cursor-pointer disabled:bg-slate-700 disabled:cursor-not-allowed gap-2'
                            >
                                <span>
                                    {weekCompleted
                                        ? 'Week completed!'
                                        : isGeneratingAnalysis
                                          ? 'Completing...'
                                          : 'Complete week'}
                                </span>
                                <span>{!isGeneratingAnalysis || weekCompleted ? '✓' : ''}</span>
                            </button>
                        </div>
                    ) : (
                        <div className='space-y-4'>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                <div>
                                    <label className='block font-medium text-white mb-2 text-base '>
                                        Activity Name
                                    </label>
                                    <input
                                        type='text'
                                        value={newRowName}
                                        onChange={e => setNewRowName(e.target.value)}
                                        placeholder='Running, Gym...'
                                        className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-600 text-white placeholder-slate-400'
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className='block text-base font-medium text-white mb-2'>Choose emoji</label>
                                    <div className='relative'>
                                        <button
                                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                            className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white text-left flex items-center justify-between cursor-pointer'
                                        >
                                            <span className='text-2xl'>{newRowEmoji}</span>
                                            <span>▼</span>
                                        </button>
                                        {showEmojiPicker && (
                                            <div className='absolute top-full left-0 right-0 mt-1 bg-slate-600 border border-slate-500 rounded-lg p-2 z-50 max-h-60 overflow-y-auto cursor-pointer'>
                                                <div className='grid grid-cols-5 gap-2'>
                                                    {emojiLibrary.map(emoji => (
                                                        <button
                                                            key={emoji}
                                                            onClick={() => {
                                                                setNewRowEmoji(emoji);
                                                                setShowEmojiPicker(false);
                                                            }}
                                                            className='p-2 hover:bg-slate-500 rounded text-2xl cursor-pointer'
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className='flex gap-2'>
                                <button
                                    onClick={addNewActivityRow}
                                    disabled={!newRowName.trim()}
                                    className='px-4 py-2 bg-blue-500/80 text-white rounded-lg hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors cursor-pointer'
                                >
                                    Add Activity
                                </button>
                                <button
                                    onClick={() => {
                                        setShowAddRow(false);
                                        setNewRowName('');
                                        setNewRowEmoji('🏃');
                                        setShowEmojiPicker(false);
                                    }}
                                    className='px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-400 transition-colors cursor-pointer'
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Weekly Trend Section */}
                {getWeeklyTrendData().length > 0 && (
                    <div className='bg-slate-700 rounded-lg p-4 sm:p-6 mb-6'>
                        <h3 className='text-lg font-semibold text-white mb-4 flex items-center'>📈 Activity Trend</h3>

                        <div className='space-y-4'>
                            {/* Combined Bar Chart + Line Graph */}
                            <div className='bg-slate-800 rounded-lg pb-2'>
                                {/* Chart Area */}
                                <div className='relative h-32 sm:h-40'>
                                    {/* Line Graph */}
                                    <svg
                                        className='absolute inset-0 w-full h-full'
                                        style={{ zIndex: 10, overflow: 'visible' }}
                                    >
                                        {getWeeklyTrendData().map((data, index) => {
                                            if (index === 0) return null;

                                            const maxCount = getMaxWeeklyCount();
                                            const prevData = getWeeklyTrendData()[index - 1];

                                            // Account for padding: use 85% of height for chart, 10% top padding, 5% bottom padding
                                            const chartHeight = 85;
                                            const topPadding = 10;

                                            const prevHeight =
                                                maxCount > 0 ? (prevData.count / maxCount) * chartHeight : 0;
                                            const currentHeight =
                                                maxCount > 0 ? (data.count / maxCount) * chartHeight : 0;

                                            const barWidth = 100 / getWeeklyTrendData().length;
                                            const prevX = (index - 1) * barWidth + barWidth / 2;
                                            const currentX = index * barWidth + barWidth / 2;

                                            // Y positions with padding: invert and add top padding
                                            const prevY = topPadding + (chartHeight - prevHeight);
                                            const currentY = topPadding + (chartHeight - currentHeight);

                                            return (
                                                <line
                                                    key={`line-${index}`}
                                                    x1={`${prevX}%`}
                                                    y1={`${prevY}%`}
                                                    x2={`${currentX}%`}
                                                    y2={`${currentY}%`}
                                                    stroke='#A020F0'
                                                    strokeWidth='3'
                                                    strokeLinecap='round'
                                                />
                                            );
                                        })}

                                        {/* Data points */}
                                        {getWeeklyTrendData().map((data, index) => {
                                            const maxCount = getMaxWeeklyCount();
                                            // Account for padding: use 85% of height for chart, 10% top padding, 5% bottom padding
                                            const chartHeight = 85;
                                            const topPadding = 10;

                                            const height = maxCount > 0 ? (data.count / maxCount) * chartHeight : 0;
                                            const barWidth = 100 / getWeeklyTrendData().length;
                                            const x = index * barWidth + barWidth / 2;
                                            // Y position with padding: invert and add top padding
                                            const y = topPadding + (chartHeight - height);

                                            return (
                                                <circle
                                                    key={`point-${index}`}
                                                    cx={`${x}%`}
                                                    cy={`${y}%`}
                                                    r='4'
                                                    fill='#A020F0'
                                                    stroke='#1e293b'
                                                    strokeWidth='2'
                                                />
                                            );
                                        })}
                                    </svg>
                                </div>

                                {/* Labels below chart */}
                                <div className='flex justify-between mt-3'>
                                    {getWeeklyTrendData().map(data => {
                                        const weekDate = new Date(data.week);
                                        const weekLabel = `Week ${getISOWeekNumber(weekDate)}`;
                                        return (
                                            <div
                                                key={data.week}
                                                className='flex flex-col items-center flex-1 text-center'
                                            >
                                                <div className='text-xs font-medium text-white mb-1'>{data.count}</div>
                                                <div className='text-xs text-slate-300'>{weekLabel}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Trend Summary */}
                            <div className='grid grid-cols-2 sm:grid-cols-2 gap-4 text-center'>
                                <div className='bg-slate-800 rounded-lg p-3 sm:col-span-1 col-span-2'>
                                    <div className='text-sm text-slate-300'>Average / week</div>
                                    <div className='text-lg font-bold text-blue-400'>
                                        {getWeeklyTrendData().length > 0
                                            ? Math.round(
                                                  getWeeklyTrendData().reduce((sum, d) => sum + d.count, 0) /
                                                      getWeeklyTrendData().length
                                              )
                                            : 0}
                                    </div>
                                </div>
                                <div className='bg-slate-800 rounded-lg p-3 flex flex-col items-center col-span-2 sm:col-span-1'>
                                    <div className='text-sm text-slate-300'>Change from last week</div>
                                    <div className='text-lg font-bold'>
                                        {(() => {
                                            const data = getWeeklyTrendData();
                                            if (data.length < 2) {
                                                return <span className='text-slate-400'>–</span>;
                                            }
                                            const thisWeek = data[data.length - 1]?.count ?? 0;
                                            const lastWeek = data[data.length - 2]?.count ?? 0;
                                            const diff = thisWeek - lastWeek;
                                            if (diff === 0) {
                                                return <span className='text-slate-400'>0</span>;
                                            } else if (diff > 0) {
                                                return <span className='text-green-400'>+{diff}</span>;
                                            } else {
                                                return <span className='text-red-400'>{diff}</span>;
                                            }
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* AI Analysis Section */}
                {(aiAnalysis || showAnalysis) && (
                    <div className='bg-slate-700 rounded-lg p-4 sm:p-6 mb-6'>
                        <div className='flex items-center justify-between mb-4'>
                            <h3 className='text-lg font-semibold text-white flex items-center'>
                                🤖 AI Weekly Analysis
                            </h3>
                        </div>

                        {isGeneratingAnalysis ? (
                            <div className='flex items-center space-x-2 text-slate-300'>
                                <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400'></div>
                                <span>Analyzing your week...</span>
                            </div>
                        ) : aiAnalysis ? (
                            <div className='text-slate-200 leading-relaxed'>{aiAnalysis}</div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
