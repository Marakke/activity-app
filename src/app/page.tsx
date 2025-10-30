'use client';

import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

interface ActivityRow {
    id: string;
    name: string;
    emoji: string;
    completedDays: string[];
}

export default function Home() {
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
    const [lastAnalysisWeek, setLastAnalysisWeek] = useState<string>('');
    const [showAnalysis, setShowAnalysis] = useState(false);

    // Initialize Gemini AI client
    const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '' });

    const emojiLibrary = ['🏃', '🚶', '🏋️', '🚴', '🏊', '🏒', '⚽', '🎾', '🥏', '⛷️', '🕺', '🧹', '❓'];

    // Initialize current week dates
    useEffect(() => {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Start from Monday

        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            weekDates.push(date);
        }
        setCurrentWeek(weekDates);
    }, []);

    // Load saved activity rows from localStorage
    useEffect(() => {  
        const savedRows = localStorage.getItem('activityRows');
        if (savedRows) {
            try {
                const parsedRows = JSON.parse(savedRows);
                // Ensure all rows have completedDays array
                const validRows = parsedRows.map((row: any) => ({
                    ...row,
                    completedDays: row.completedDays || [],
                }));
                setActivityRows(validRows);
            } catch (error) {
                console.error('Error parsing saved rows:', error);
                setActivityRows([]);
            }
        } else {
            setActivityRows([]);
        }
        setIsLoading(false);
    }, []);

    // Save activity rows to localStorage
    useEffect(() => {
        if (activityRows.length > 0) {
            localStorage.setItem('activityRows', JSON.stringify(activityRows));
        }
    }, [activityRows]);

    const isActivityCompleted = (rowId: string, date: Date): boolean => {
        const dateStr = date.toISOString().split('T')[0];
        const row = activityRows.find(row => row.id === rowId);
        if (!row || !row.completedDays) return false;
        return row.completedDays.includes(dateStr);
    };

    const toggleActivityCompletion = (rowId: string, date: Date) => {
        const dateStr = date.toISOString().split('T')[0];
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

    const getAverageActivities = (): number => {
        const totalActivities = getTotalActivities();
        // Only count days up to today (including today)
        const today = new Date();
        const daysUpToToday = currentWeek.filter(date => date <= today).length;
        return daysUpToToday > 0 ? Math.round((totalActivities / daysUpToToday) * 10) / 10 : 0;
    };

    const getActiveDays = (): number => {
        const allCompletedDays = activityRows.flatMap(row => row.completedDays || []);
        const uniqueDates = new Set(allCompletedDays);
        return uniqueDates.size;
    };

    const getTotalActivitiesForDay = (date: Date): number => {
        const dateStr = date.toISOString().split('T')[0];
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
            const weekKey = weekStart.toISOString().split('T')[0];
            
            if (!weekGroups[weekKey]) {
                weekGroups[weekKey] = [];
            }
            weekGroups[weekKey].push(dateStr);
        });

        // Convert to array and sort by week
        const trendData = Object.entries(weekGroups)
            .map(([week, dates]) => ({
                week: week,
                count: dates.length
            }))
            .sort((a, b) => a.week.localeCompare(b.week));

        return trendData;
    };

    const getMaxWeeklyCount = (): number => {
        const trendData = getWeeklyTrendData();
        return trendData.length > 0 ? Math.max(...trendData.map(d => d.count)) : 0;
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

    const deleteActivityRow = (rowId: string) => {
        // Allow deleting any activity row (but Total row is not in activityRows)
        setActivityRows(prev => prev.filter(row => row.id !== rowId));
    };

    // Generate AI analysis for the week
    const generateAIAnalysis = async () => {
        if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
            // Fallback analysis if no API key
            const totalActivities = getTotalActivities();
            const activeDays = getActiveDays();
            const averagePerDay = getAverageActivities();
            
            const fallbackAnalysis = `This week you completed ${totalActivities} activities across ${activeDays} days, averaging ${averagePerDay} activities per day. ${
                activeDays >= 5 ? 'Great consistency!' : 'Keep building those healthy habits!'
            }`;
            
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
                    totalThisWeek: row.completedDays.length
                })),
                weekStats: {
                    totalActivities: getTotalActivities(),
                    activeDays: getActiveDays(),
                    averagePerDay: getAverageActivities()
                },
                weekRange: `${currentWeek[0]?.toLocaleDateString()} to ${currentWeek[6]?.toLocaleDateString()}`
            };

            const prompt = `Analyze this week's activity data and provide a brief, motivational summary (2-3 sentences). Focus on patterns, achievements, and encouragement. Be positive and specific about what they accomplished. Data: ${JSON.stringify(weekData)}`;

            // Use the new Google GenAI SDK
            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash-001',
                contents: prompt
            });
            
            const analysis = response.text || '';

            setAiAnalysis(analysis);
            
            // Cache the analysis
            const currentWeekKey = currentWeek[0]?.toISOString().split('T')[0] || '';
            if (analysis) {
                localStorage.setItem(`ai_analysis_${currentWeekKey}`, analysis);
                setLastAnalysisWeek(currentWeekKey);
            }
            
        } catch (error) {
            console.error('Error generating AI analysis:', error);
            // Fallback to basic analysis
            const totalActivities = getTotalActivities();
            const activeDays = getActiveDays();
            setAiAnalysis(`This week you completed ${totalActivities} activities across ${activeDays} days. Keep up the great work!`);
        } finally {
            setIsGeneratingAnalysis(false);
        }
    };

    // Complete the week and generate analysis
    const completeWeek = async () => {
        await generateAIAnalysis();
        setWeekCompleted(true);
    };

    // Load cached analysis on component mount
    useEffect(() => {
        const currentWeekKey = currentWeek[0]?.toISOString().split('T')[0] || '';
        const cachedAnalysis = localStorage.getItem(`ai_analysis_${currentWeekKey}`);
        if (cachedAnalysis) {
            setAiAnalysis(cachedAnalysis);
            setLastAnalysisWeek(currentWeekKey);
        }
    }, [currentWeek]);

    // Utility to get ISO week number
    function getISOWeekNumber(date: Date): number {
        const tempDate = new Date(date.getTime());
        tempDate.setHours(0, 0, 0, 0);
        // Thursday in current week decides the year
        tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7));
        // January 4 is always in week 1.
        const week1 = new Date(tempDate.getFullYear(), 0, 4);
        // Adjust to Thursday in week 1 and count number of weeks from date to week1.
        return (
            1 + Math.round(
                ((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
            )
        );
    }

    if (isLoading) {
        return (
            <div className='min-h-screen bg-slate-800 flex items-center justify-center'>
                <div className='text-white text-xl'>Loading...</div>
            </div>
        );
    }

    return (
        <div className='min-h-screen bg-slate-800'>
            <div className='container mx-auto px-4 py-4 sm:py-8 max-w-4xl'>
                {/* Header */}
                <div className='text-center mb-6'>
                    <h1 className='text-2xl sm:text-4xl font-bold text-white mb-2'>Activity Tracker</h1>
                    <p className='text-white text-sm sm:text-lg'>Track your daily activities and stay motivated!</p>
                </div>

                {/* Statistics */}
                <div className='grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6'>
                    <div className='bg-slate-700 rounded-lg p-4 sm:p-6 shadow-md text-center'>
                        <h3 className='text-sm sm:text-lg font-semibold text-white mb-1 sm:mb-2 text-center'>Total Activities</h3>
                        <p className='text-2xl sm:text-3xl font-bold text-blue-400 text-center'>{getTotalActivities()}</p>
                    </div>
                    <div className='bg-slate-700 rounded-lg p-4 sm:p-6 shadow-md text-center'>
                        <h3 className='text-sm sm:text-lg font-semibold text-white mb-1 sm:mb-2 text-center'>Average per Day</h3>
                        <p className='text-2xl sm:text-3xl font-bold text-green-400 text-center'>{getAverageActivities()}</p>
                    </div>
                    <div className='bg-slate-700 rounded-lg p-4 sm:p-6 shadow-md text-center'>
                        <h3 className='text-sm sm:text-lg font-semibold text-white mb-1 sm:mb-2 text-center'>Active Days</h3>
                        <p className='text-2xl sm:text-3xl font-bold text-purple-400 text-center'>{getActiveDays()}</p>
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
                                        <div className='text-xs'>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
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
                                            isCurrentDay
                                                ? 'bg-slate-500 border-2 border-blue-400'
                                                : 'bg-slate-600'
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
                        {activityRows.map(row => (
                            <div key={row.id} className='grid grid-cols-9 gap-1 sm:gap-2 items-center'>
                                {/* Activity Emoji and Name */}
                                <div className='flex items-center space-x-1 sm:space-x-2'>
                                    <span className='text-xl sm:text-2xl'>{row.emoji}</span>
                                    <span className='text-white text-xs sm:text-sm font-medium hidden sm:block'>{row.name}</span>
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
                                                {isCompleted && <span className='text-black text-lg sm:text-xl font-bold'>✓</span>}
                                            </button>
                                        </div>
                                    );
                                })}

                                {/* Delete Button */}
                                <div className='flex justify-center'>
                                    <button
                                        onClick={() => deleteActivityRow(row.id)}
                                        className='text-red-400 py-2 px-4 hover:text-red-300 text-lg sm:text-xl font-bold cursor-pointer'
                                    >
                                        X
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* No activities message */}
                {activityRows.length === 0 && (
                    <div className='text-center mb-4 sm:mb-6 p-4 bg-slate-700 rounded-lg'>
                        <p className='text-slate-300 text-sm sm:text-base'>
                            <strong>Get started:</strong> Add your first activity row below to begin tracking your daily activities!
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
                                onClick={async () => { setShowAnalysis(true); await completeWeek(); }}
                                disabled={isGeneratingAnalysis || weekCompleted}
                                className='w-full py-3 px-4 bg-sky-500/75 text-white rounded-lg hover:bg-sky-500 transition-colors font-medium flex items-center justify-center cursor-pointer disabled:bg-slate-700 disabled:cursor-not-allowed gap-2'
                            >
                                <span>{weekCompleted
                                    ? 'Week completed!'
                                    : isGeneratingAnalysis
                                        ? 'Completing...'
                                        : 'Complete week'
                                }</span>
                                <span>{!isGeneratingAnalysis || weekCompleted ? '✓' : ''}</span>
                            </button>
                        </div>
                    ) : (
                        <div className='space-y-4'>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                <div>
                                    <label className='block font-medium text-white mb-2 text-base '>Activity Name</label>
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
                                            <div className='absolute top-full left-0 right-0 mt-1 bg-slate-600 border border-slate-500 rounded-lg p-2 z-10 max-h-60 overflow-y-auto cursor-pointer'>
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
                        <h3 className='text-lg font-semibold text-white mb-4 flex items-center'>
                            📈 Activity Trend
                        </h3>
                        
                        <div className='space-y-4'>
                            {/* Combined Bar Chart + Line Graph */}
                            <div className='bg-slate-800 rounded-lg pb-2'>
                                {/* Chart Area */}
                                <div className='relative h-32 sm:h-40'>
                                    {/* Line Graph */}
                                    <svg className='absolute inset-0 w-full h-full' style={{ zIndex: 10, overflow: 'visible' }}>
                                        {getWeeklyTrendData().map((data, index) => {
                                            if (index === 0) return null;
                                            
                                            const maxCount = getMaxWeeklyCount();
                                            const prevData = getWeeklyTrendData()[index - 1];
                                            
                                            // Account for padding: use 85% of height for chart, 10% top padding, 5% bottom padding
                                            const chartHeight = 85;
                                            const topPadding = 10;
                                            
                                            const prevHeight = maxCount > 0 ? (prevData.count / maxCount) * chartHeight : 0;
                                            const currentHeight = maxCount > 0 ? (data.count / maxCount) * chartHeight : 0;
                                            
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
                                    {getWeeklyTrendData().map((data, index) => {
                                        const weekDate = new Date(data.week);
                                        const weekLabel = `Week ${getISOWeekNumber(weekDate)}`;
                                        return (
                                            <div key={data.week} className='flex flex-col items-center flex-1 text-center'>
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
                                            ? Math.round(getWeeklyTrendData().reduce((sum, d) => sum + d.count, 0) / getWeeklyTrendData().length)
                                            : 0
                                        }
                                    </div>
                                </div>
                                <div className='bg-slate-800 rounded-lg p-3 flex flex-col items-center'>
                                    <div className='text-sm text-slate-300'>Change from last week</div>
                                    <div className='text-lg font-bold'>
                                        {(() => {
                                            const data = getWeeklyTrendData();
                                            if (data.length < 2) {
                                                return (
                                                    <span className="text-slate-400">–</span>
                                                );
                                            }
                                            const thisWeek = data[data.length - 1]?.count ?? 0;
                                            const lastWeek = data[data.length - 2]?.count ?? 0;
                                            const diff = thisWeek - lastWeek;
                                            if (diff === 0) {
                                                return <span className="text-slate-400">0</span>;
                                            } else if (diff > 0) {
                                                return <span className="text-green-400">+{diff}</span>;
                                            } else {
                                                return <span className="text-red-400">{diff}</span>;
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
                            <div className='text-slate-200 leading-relaxed'>
                                {aiAnalysis}
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
