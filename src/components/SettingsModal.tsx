'use client';

import { useEffect, useRef, useState } from 'react';
import type { UserPreferences, UserPreferencesInput } from '@/lib/meals';
import { upsertUserPreferences } from '@/lib/meals';

type IconProps = React.SVGProps<SVGSVGElement>;

function XIcon(props: IconProps) {
    return (
        <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            {...props}
        >
            <path d='M18 6 6 18' />
            <path d='m6 6 12 12' />
        </svg>
    );
}

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userPreferences: UserPreferences | null;
    userId: string;
    onSave: (preferences: UserPreferences) => void;
}

export default function SettingsModal({ isOpen, onClose, userPreferences, userId, onSave }: SettingsModalProps) {
    const [caloriesGoal, setCaloriesGoal] = useState<string>('');
    const [proteinGoal, setProteinGoal] = useState<string>('');
    const [carbsGoal, setCarbsGoal] = useState<string>('');
    const [fatsGoal, setFatsGoal] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    // Initialize form values from userPreferences
    useEffect(() => {
        if (userPreferences) {
            setCaloriesGoal(userPreferences.daily_calories_goal?.toString() || '');
            setProteinGoal(userPreferences.daily_protein_goal?.toString() || '');
            setCarbsGoal(userPreferences.daily_carbs_goal?.toString() || '');
            setFatsGoal(userPreferences.daily_fats_goal?.toString() || '');
        } else {
            setCaloriesGoal('');
            setProteinGoal('');
            setCarbsGoal('');
            setFatsGoal('');
        }
        setError(null);
    }, [userPreferences, isOpen]);

    // Handle click outside to close
    useEffect(() => {
        if (!isOpen) return;

        const handleClick = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClick);
        return () => {
            document.removeEventListener('mousedown', handleClick);
        };
    }, [isOpen, onClose]);

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);

        try {
            const preferences: UserPreferencesInput = {
                daily_calories_goal: caloriesGoal ? Number.parseInt(caloriesGoal, 10) : null,
                daily_protein_goal: proteinGoal ? Number.parseInt(proteinGoal, 10) : null,
                daily_carbs_goal: carbsGoal ? Number.parseInt(carbsGoal, 10) : null,
                daily_fats_goal: fatsGoal ? Number.parseInt(fatsGoal, 10) : null,
            };

            const saved = await upsertUserPreferences(userId, preferences);
            onSave(saved);
            onClose();
        } catch (err) {
            console.error('Error saving preferences:', err);
            setError('Failed to save preferences. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4'>
            <div ref={modalRef} className='relative w-full max-w-md rounded-lg bg-slate-700 p-6 shadow-lg'>
                {/* Close button */}
                <button
                    onClick={onClose}
                    className='absolute right-4 top-4 text-slate-400 hover:text-white transition-colors cursor-pointer'
                    aria-label='Close settings'
                >
                    <XIcon className='w-5 h-5' />
                </button>

                {/* Header */}
                <h2 className='text-xl font-semibold text-white mb-6 pr-8'>Settings</h2>

                {/* Form */}
                <div className='space-y-4'>
                    <div>
                        <label className='block text-sm font-medium text-white mb-2'>Daily Calories Goal</label>
                        <input
                            type='number'
                            value={caloriesGoal}
                            onChange={e => setCaloriesGoal(e.target.value)}
                            placeholder='e.g., 2000'
                            min='0'
                            className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-white mb-2'>Daily Protein Goal (grams)</label>
                        <input
                            type='number'
                            value={proteinGoal}
                            onChange={e => setProteinGoal(e.target.value)}
                            placeholder='e.g., 150'
                            min='0'
                            className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-white mb-2'>Daily Carbs Goal (grams)</label>
                        <input
                            type='number'
                            value={carbsGoal}
                            onChange={e => setCarbsGoal(e.target.value)}
                            placeholder='e.g., 200'
                            min='0'
                            className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-white mb-2'>Daily Fats Goal (grams)</label>
                        <input
                            type='number'
                            value={fatsGoal}
                            onChange={e => setFatsGoal(e.target.value)}
                            placeholder='e.g., 65'
                            min='0'
                            className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        />
                    </div>

                    {error && (
                        <div className='rounded-lg bg-red-900/50 border border-red-700 p-3 text-red-200 text-sm'>
                            {error}
                        </div>
                    )}

                    <div className='flex gap-3 pt-2'>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className='flex-1 px-4 py-2 bg-blue-500/80 text-white rounded-lg hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium'
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                            onClick={onClose}
                            disabled={isSaving}
                            className='px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-400 disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors cursor-pointer'
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
