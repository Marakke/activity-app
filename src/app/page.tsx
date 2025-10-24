'use client';

import { useState, useEffect } from 'react';

interface DayActivity {
    date: string;
    count: number;
}

interface ActivityType {
    id: string;
    name: string;
    color: string;
}

interface ActivityRow {
    id: string;
    name: string;
    color: string;
    activities: DayActivity[];
}

export default function Home() {
    const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
    const [currentWeek, setCurrentWeek] = useState<Date[]>([]);
    const [newRowName, setNewRowName] = useState<string>('');
    const [showAddRow, setShowAddRow] = useState<boolean>(false);

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

    // Initialize with default activity row if none exist
    useEffect(() => {
        const savedRows = localStorage.getItem('activityRows');
        if (savedRows) {
            setActivityRows(JSON.parse(savedRows));
        } else {
            // Create default activity row
            const defaultRow: ActivityRow = {
                id: 'default',
                name: 'General',
                color: 'blue',
                activities: []
            };
            setActivityRows([defaultRow]);
        }
    }, []);

    // Save activity rows to localStorage
    useEffect(() => {
        if (activityRows.length > 0) {
            localStorage.setItem('activityRows', JSON.stringify(activityRows));
        }
    }, [activityRows]);

    const getActivityCount = (rowId: string, date: Date): number => {
        const dateStr = date.toISOString().split('T')[0];
        const row = activityRows.find(row => row.id === rowId);
        if (!row) return 0;
        const dayActivity = row.activities.find(activity => activity.date === dateStr);
        return dayActivity ? dayActivity.count : 0;
    };

    const updateActivityCount = (rowId: string, date: Date, newCount: number) => {
        const dateStr = date.toISOString().split('T')[0];
        setActivityRows(prev => {
            return prev.map(row => {
                if (row.id === rowId) {
                    const filtered = row.activities.filter(activity => activity.date !== dateStr);
                    if (newCount > 0) {
                        return {
                            ...row,
                            activities: [...filtered, { date: dateStr, count: newCount }]
                        };
                    }
                    return { ...row, activities: filtered };
                }
                return row;
            });
        });
    };

    const incrementActivity = (rowId: string, date: Date) => {
        const currentCount = getActivityCount(rowId, date);
        updateActivityCount(rowId, date, currentCount + 1);
    };

    const decrementActivity = (rowId: string, date: Date) => {
        const currentCount = getActivityCount(rowId, date);
        if (currentCount > 0) {
            updateActivityCount(rowId, date, currentCount - 1);
        }
    };

    const getTotalActivities = (): number => {
        return activityRows.reduce((total, row) => {
            return total + row.activities.reduce((rowTotal, activity) => rowTotal + activity.count, 0);
        }, 0);
    };

    const getAverageActivities = (): number => {
        const allActivities = activityRows.flatMap(row => row.activities);
        const daysWithActivities = allActivities.length;
        return daysWithActivities > 0
            ? Math.round((getTotalActivities() / daysWithActivities) * 10) / 10
            : 0;
    };

    const getActiveDays = (): number => {
        const allActivities = activityRows.flatMap(row => row.activities);
        const uniqueDates = new Set(allActivities.map(activity => activity.date));
        return uniqueDates.size;
    };

    const formatDate = (date: Date): string => {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });
    };

    const isToday = (date: Date): boolean => {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    };

    const addNewActivityRow = () => {
        if (newRowName.trim()) {
            const colors = ['blue', 'green', 'purple', 'red', 'yellow', 'indigo', 'pink', 'orange'];
            const newRow: ActivityRow = {
                id: Date.now().toString(),
                name: newRowName.trim(),
                color: colors[activityRows.length % colors.length],
                activities: []
            };
            setActivityRows(prev => [...prev, newRow]);
            setNewRowName('');
            setShowAddRow(false);
        }
    };

    const deleteActivityRow = (rowId: string) => {
        if (activityRows.length > 1) {
            setActivityRows(prev => prev.filter(row => row.id !== rowId));
        }
    };

    const getColorClasses = (color: string) => {
        const colorMap: { [key: string]: string } = {
            blue: 'bg-blue-500 hover:bg-blue-600',
            green: 'bg-green-500 hover:bg-green-600',
            purple: 'bg-purple-500 hover:bg-purple-600',
            red: 'bg-red-500 hover:bg-red-600',
            yellow: 'bg-yellow-500 hover:bg-yellow-600',
            indigo: 'bg-indigo-500 hover:bg-indigo-600',
            pink: 'bg-pink-500 hover:bg-pink-600',
            orange: 'bg-orange-500 hover:bg-orange-600'
        };
        return colorMap[color] || 'bg-blue-500 hover:bg-blue-600';
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
            <div className="container mx-auto px-4 py-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
                        Activity Tracker
                    </h1>
                    <p className="text-gray-600 dark:text-gray-300">
                        Track your daily activities and stay motivated!
                    </p>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Total Activities
                        </h3>
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                            {getTotalActivities()}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Average per Day
                        </h3>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                            {getAverageActivities()}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Active Days
                        </h3>
                        <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                            {getActiveDays()}
                        </p>
                    </div>
                </div>

                {/* Activity Rows */}
                <div className="space-y-6">
                    {activityRows.map((row) => (
                        <div key={row.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                                    {row.name}
                                </h2>
                                {activityRows.length > 1 && (
                                    <button
                                        onClick={() => deleteActivityRow(row.id)}
                                        className="text-red-500 hover:text-red-700 text-sm"
                                    >
                                        Delete Row
                                    </button>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
                                {currentWeek.map((date, index) => {
                                    const count = getActivityCount(row.id, date);
                                    const isCurrentDay = isToday(date);

                                    return (
                                        <div
                                            key={index}
                                            className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                                                isCurrentDay
                                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                    : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700'
                                            }`}
                                        >
                                            <div className="text-center">
                                                <h3
                                                    className={`font-semibold mb-2 ${
                                                        isCurrentDay
                                                            ? 'text-blue-700 dark:text-blue-300'
                                                            : 'text-gray-700 dark:text-gray-300'
                                                    }`}
                                                >
                                                    {formatDate(date)}
                                                </h3>

                                                <div className="mb-3">
                                                    <span className="text-2xl font-bold text-gray-800 dark:text-white">
                                                        {count}
                                                    </span>
                                                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">
                                                        activities
                                                    </span>
                                                </div>

                                                <div className="flex gap-2 justify-center">
                                                    <button
                                                        onClick={() =>
                                                            decrementActivity(row.id, date)
                                                        }
                                                        disabled={count === 0}
                                                        className="w-8 h-8 rounded-full bg-red-500 text-white hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        -
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            incrementActivity(row.id, date)
                                                        }
                                                        className={`w-8 h-8 rounded-full text-white transition-colors ${getColorClasses(row.color)}`}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Add New Row Section */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    {!showAddRow ? (
                        <button
                            onClick={() => setShowAddRow(true)}
                            className="w-full py-3 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
                        >
                            + Add New Activity Type
                        </button>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Activity Name
                                </label>
                                <input
                                    type="text"
                                    value={newRowName}
                                    onChange={(e) => setNewRowName(e.target.value)}
                                    placeholder="e.g., Running, Gym, Reading..."
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={addNewActivityRow}
                                    disabled={!newRowName.trim()}
                                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    Add Activity
                                </button>
                                <button
                                    onClick={() => {
                                        setShowAddRow(false);
                                        setNewRowName('');
                                    }}
                                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Reset Button */}
                <div className="text-center mt-8">
                    <button
                        onClick={() => {
                            setActivityRows([]);
                            localStorage.removeItem('activityRows');
                        }}
                        className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                        Reset All Data
                    </button>
                </div>
            </div>
        </div>
    );
}
