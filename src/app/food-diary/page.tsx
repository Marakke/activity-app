'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';

import { supabase } from '@/lib/supabase';
import {
    createSavedMeal,
    deleteMeal,
    getDailyTotalsForRange,
    getMealsForRange,
    getSavedMeals,
    updateSavedMeal,
    type DailyTotals,
    type Meal,
    type MealInput,
    type SavedMeal,
    upsertMeal,
} from '@/lib/meals';

interface TrendPoint {
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
}

type IconProps = React.SVGProps<SVGSVGElement>;

function CalendarIcon(props: IconProps) {
    return (
        <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
            strokeLinejoin='round'
            {...props}
        >
            <rect x='3.75' y='4.5' width='16.5' height='16.5' rx='2' />
            <path d='M8 3v3' />
            <path d='M16 3v3' />
            <path d='M3.75 9.75h16.5' />
        </svg>
    );
}

function ClockIcon(props: IconProps) {
    return (
        <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
            strokeLinejoin='round'
            {...props}
        >
            <circle cx='12' cy='12' r='9' />
            <path d='M12 7.5v4.5l2.5 2.5' />
        </svg>
    );
}

function ChevronDownIcon(props: IconProps) {
    return (
        <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
            strokeLinejoin='round'
            {...props}
        >
            <path d='m6 9 6 6 6-6' />
        </svg>
    );
}

function ArrowLeftIcon(props: IconProps) {
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
            <path d='M18 12H6' />
            <path d='m9 5-7 7 7 7' />
        </svg>
    );
}

function SpinnerIcon(props: IconProps) {
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
            <path d='M21 12a9 9 0 1 1-6.219-8.56' />
        </svg>
    );
}

function formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function getLocalTimeHHMM(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function normalizeTimeInput(value: string): string {
    if (!value) {
        return '00:00';
    }

    const sanitized = value.replace('.', ':').replace(/[^0-9:]/g, '');

    if (!sanitized.includes(':')) {
        const digits = sanitized.replace(/[^0-9]/g, '');
        if (digits.length >= 3) {
            const hoursPart = digits.slice(0, digits.length - 2);
            const minutesPart = digits.slice(-2);
            const hours = Math.max(0, Math.min(23, Number(hoursPart)))
                .toString()
                .padStart(2, '0');
            const minutes = Math.max(0, Math.min(59, Number(minutesPart)))
                .toString()
                .padStart(2, '0');
            return `${hours}:${minutes}`;
        }
        if (digits.length === 2) {
            const hours = Math.max(0, Math.min(23, Number(digits)))
                .toString()
                .padStart(2, '0');
            return `${hours}:00`;
        }
        if (digits.length === 1) {
            const hours = `0${digits}`;
            return `${hours}:00`;
        }
    }

    const [hoursRaw = '00', minutesRaw = '00'] = sanitized.split(':');
    const hours = Math.max(0, Math.min(23, Number(hoursRaw)))
        .toString()
        .padStart(2, '0');
    const minutes = Math.max(0, Math.min(59, Number(minutesRaw)))
        .toString()
        .padStart(2, '0');
    return `${hours}:${minutes}`;
}

function parseNumberInput(value: string): number {
    if (value == null) return NaN;
    const normalized = value.replace(',', '.').trim();
    if (normalized === '') return NaN;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function formatMealTime(value: string): string {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return getLocalTimeHHMM(parsed);
    }

    const match = value.match(/\d{2}:\d{2}/);
    if (match) {
        return normalizeTimeInput(match[0]);
    }

    const dotMatch = value.match(/\d{2}\.\d{2}/);
    if (dotMatch) {
        return normalizeTimeInput(dotMatch[0]);
    }

    return normalizeTimeInput(value);
}

function startOfMonday(date: Date): Date {
    const monday = new Date(date);
    const day = monday.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() + diff);
    return monday;
}

function endOfSunday(date: Date): Date {
    const sunday = new Date(startOfMonday(date));
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
}

const formatDateInput = (date: Date): string => formatDateKey(date);

function startOfMonth(date: Date): Date {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    next.setDate(1);
    return next;
}

function combineDateAndTime(date: Date, time: string): string {
    const normalized = normalizeTimeInput(time || '12:00');
    const [hours, minutes] = normalized.split(':').map(Number);
    const combined = new Date(date);
    combined.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    return combined.toISOString();
}

// Macro colors for consistent styling across graphs and statistics
const MACRO_COLORS = {
    protein: '#22c55e', // Green
    carbs: '#d4a574', // Beige/tan (bread color)
    fats: '#eab308', // Yellow
} as const;

export default function FoodDiaryPage() {
    const [user, setUser] = useState<User | null>(null);
    const [meals, setMeals] = useState<Meal[]>([]);
    const [dailyTotals, setDailyTotals] = useState<DailyTotals[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [mealTime, setMealTime] = useState<string>(normalizeTimeInput(getLocalTimeHHMM(new Date())));
    const [mealName, setMealName] = useState('');
    const [calories, setCalories] = useState('');
    const [protein, setProtein] = useState('');
    const [carbs, setCarbs] = useState('');
    const [fats, setFats] = useState('');
    const [notes, setNotes] = useState('');
    const [mealDescription, setMealDescription] = useState('');
    const [isAnalyzingMeal, setIsAnalyzingMeal] = useState(false);
    const [aiEstimateError, setAiEstimateError] = useState<string | null>(null);
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
    const [datePickerMonth, setDatePickerMonth] = useState(() => startOfMonth(new Date()));
    const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
    const [selectedSavedMealId, setSelectedSavedMealId] = useState<string>('');
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
    const [menuOpenMealId, setMenuOpenMealId] = useState<string | null>(null);
    const [editingMealId, setEditingMealId] = useState<string | null>(null);

    const datePickerRef = useRef<HTMLDivElement | null>(null);
    const timePickerRef = useRef<HTMLDivElement | null>(null);
    const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '' });

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

    useEffect(() => {
        if (!user) return;

        const load = async () => {
            setIsLoading(true);
            try {
                const start = startOfMonday(selectedDate);
                const end = endOfSunday(selectedDate);
                const mealsData = await getMealsForRange(user.id, start, end);

                const trendStart = new Date(start);
                trendStart.setDate(trendStart.getDate() - 42); // prior 6 weeks
                const dailyTotalsData = await getDailyTotalsForRange(user.id, trendStart, end);

                setMeals(mealsData);
                setDailyTotals(dailyTotalsData);
            } catch (error) {
                console.error('Failed to load food diary data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [user, selectedDate]);

    useEffect(() => {
        if (!user) return;

        const loadSavedMeals = async () => {
            try {
                const savedMealsData = await getSavedMeals(user.id);
                setSavedMeals(savedMealsData);
            } catch {
                // Error is already logged in getSavedMeals, just handle gracefully
                setSavedMeals([]);
            }
        };

        loadSavedMeals();
    }, [user]);

    useEffect(() => {
        setDatePickerMonth(startOfMonth(selectedDate));
    }, [selectedDate]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuOpenMealId) {
                const menu = menuRefs.current[menuOpenMealId];
                const target = event.target as Node;
                if (menu && !menu.contains(target)) {
                    setMenuOpenMealId(null);
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpenMealId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (isDatePickerOpen && datePickerRef.current && !datePickerRef.current.contains(target)) {
                setIsDatePickerOpen(false);
            }
            if (isTimePickerOpen && timePickerRef.current && !timePickerRef.current.contains(target)) {
                setIsTimePickerOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsDatePickerOpen(false);
                setIsTimePickerOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isDatePickerOpen, isTimePickerOpen]);

    const mealsByDay = useMemo(() => {
        const grouped: Record<string, Meal[]> = {};
        meals.forEach(meal => {
            const day = formatDateKey(new Date(meal.meal_time));
            if (!grouped[day]) {
                grouped[day] = [];
            }
            grouped[day].push(meal);
        });
        return grouped;
    }, [meals]);

    const computedTotalsByDay = useMemo(() => {
        const totals: Record<string, DailyTotals> = {};
        Object.entries(mealsByDay).forEach(([day, dayMeals]) => {
            const aggregate = dayMeals.reduce(
                (acc, meal) => {
                    acc.total_calories += meal.calories ?? 0;
                    acc.total_protein += meal.protein ?? 0;
                    acc.total_carbs += meal.carbs ?? 0;
                    acc.total_fats += meal.fats ?? 0;
                    return acc;
                },
                {
                    total_calories: 0,
                    total_protein: 0,
                    total_carbs: 0,
                    total_fats: 0,
                }
            );

            totals[day] = {
                meal_day: day,
                total_calories: aggregate.total_calories,
                total_protein: aggregate.total_protein,
                total_carbs: aggregate.total_carbs,
                total_fats: aggregate.total_fats,
            };
        });
        return totals;
    }, [mealsByDay]);

    const totalsByDay = useMemo(() => {
        const dictionary: Record<string, DailyTotals> = {};
        dailyTotals.forEach(total => {
            const key = formatDateKey(new Date(total.meal_day));
            dictionary[key] = total;
        });

        Object.entries(computedTotalsByDay).forEach(([day, totals]) => {
            dictionary[day] = totals;
        });

        return dictionary;
    }, [dailyTotals, computedTotalsByDay]);

    const selectedDayKey = formatDateKey(selectedDate);
    const totalsForSelectedDay = totalsByDay[selectedDayKey];

    const currentWeek = useMemo(() => {
        const start = startOfMonday(selectedDate);
        return Array.from({ length: 7 }, (_v, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            return date;
        });
    }, [selectedDate]);

    const weeklyAverages = useMemo(() => {
        // Get the last 7 days (excluding today)
        const last7Days: Date[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let i = 1; i <= 7; i += 1) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            last7Days.push(date);
        }

        let daysWithData = 0;
        const totals = last7Days.reduce(
            (acc, date) => {
                const key = formatDateKey(date);
                const dayTotals = totalsByDay[key];
                const dayCalories = dayTotals?.total_calories ?? 0;
                // Only count days that have meals logged (calories > 0)
                if (dayCalories > 0) {
                    daysWithData += 1;
                }
                return {
                    calories: acc.calories + dayCalories,
                    protein: acc.protein + (dayTotals?.total_protein ?? 0),
                    carbs: acc.carbs + (dayTotals?.total_carbs ?? 0),
                    fats: acc.fats + (dayTotals?.total_fats ?? 0),
                };
            },
            { calories: 0, protein: 0, carbs: 0, fats: 0 }
        );

        // Only divide by days that actually have data
        if (daysWithData === 0) {
            return {
                avgCalories: 0,
                avgProtein: 0,
                avgCarbs: 0,
                avgFats: 0,
            };
        }

        return {
            avgCalories: Math.round(totals.calories / daysWithData),
            avgProtein: Math.round(totals.protein / daysWithData),
            avgCarbs: Math.round(totals.carbs / daysWithData),
            avgFats: Math.round(totals.fats / daysWithData),
        };
    }, [totalsByDay]);

    const dailyTrend: TrendPoint[] = useMemo(() => {
        const trend = dailyTotals.map(total => ({
            date: formatDateKey(new Date(total.meal_day)),
            calories: total.total_calories ?? 0,
            protein: total.total_protein ?? 0,
            carbs: total.total_carbs ?? 0,
            fats: total.total_fats ?? 0,
        }));

        Object.entries(computedTotalsByDay).forEach(([day, totals]) => {
            const existingIndex = trend.findIndex(point => point.date === day);
            if (existingIndex >= 0) {
                trend[existingIndex] = {
                    date: day,
                    calories: totals.total_calories ?? 0,
                    protein: totals.total_protein ?? 0,
                    carbs: totals.total_carbs ?? 0,
                    fats: totals.total_fats ?? 0,
                };
            } else {
                trend.push({
                    date: day,
                    calories: totals.total_calories ?? 0,
                    protein: totals.total_protein ?? 0,
                    carbs: totals.total_carbs ?? 0,
                    fats: totals.total_fats ?? 0,
                });
            }
        });

        return trend.sort((a, b) => a.date.localeCompare(b.date));
    }, [dailyTotals, computedTotalsByDay]);

    const maxTrendCalories = useMemo(() => {
        return dailyTrend.length > 0 ? Math.max(...dailyTrend.map(point => point.calories)) : 0;
    }, [dailyTrend]);

    const maxTrendProtein = useMemo(() => {
        return dailyTrend.length > 0 ? Math.max(...dailyTrend.map(point => point.protein)) : 0;
    }, [dailyTrend]);

    const maxTrendCarbs = useMemo(() => {
        return dailyTrend.length > 0 ? Math.max(...dailyTrend.map(point => point.carbs)) : 0;
    }, [dailyTrend]);

    const maxTrendFats = useMemo(() => {
        return dailyTrend.length > 0 ? Math.max(...dailyTrend.map(point => point.fats)) : 0;
    }, [dailyTrend]);

    const calendarDays = useMemo(() => {
        const start = startOfMonday(datePickerMonth);
        const days: Date[] = [];
        for (let index = 0; index < 42; index += 1) {
            const day = new Date(start);
            day.setDate(start.getDate() + index);
            days.push(day);
        }
        return days;
    }, [datePickerMonth]);

    const timeOptions = useMemo(() => {
        const options: string[] = [];
        for (let hour = 0; hour < 24; hour += 1) {
            for (let minute = 0; minute < 60; minute += 15) {
                const formattedHour = String(hour).padStart(2, '0');
                const formattedMinute = String(minute).padStart(2, '0');
                options.push(`${formattedHour}:${formattedMinute}`);
            }
        }
        return options;
    }, []);

    const resetForm = () => {
        setMealName('');
        setCalories('');
        setProtein('');
        setCarbs('');
        setFats('');
        setNotes('');
        setMealTime(normalizeTimeInput(getLocalTimeHHMM(new Date())));
        setMealDescription('');
        setAiEstimateError(null);
        setSelectedSavedMealId('');
        setEditingMealId(null);
    };

    const handleEditMeal = (meal: Meal) => {
        setEditingMealId(meal.id);
        setMealName(meal.meal_name);
        setCalories(String(meal.calories));
        setProtein(String(meal.protein));
        setCarbs(String(meal.carbs));
        setFats(String(meal.fats));
        setNotes(meal.notes || '');
        const mealDate = new Date(meal.meal_time);
        setSelectedDate(mealDate);
        setMealTime(formatMealTime(meal.meal_time));
        setMenuOpenMealId(null);
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSavedMealSelect = (mealId: string) => {
        setSelectedSavedMealId(mealId);
        if (!mealId) return;

        const savedMeal = savedMeals.find(meal => meal.id === mealId);
        if (savedMeal) {
            setMealName(savedMeal.meal_name);
            setCalories(String(savedMeal.calories));
            setProtein(String(savedMeal.protein));
            setCarbs(String(savedMeal.carbs));
            setFats(String(savedMeal.fats));
        }
    };

    const handleSaveAsTemplate = async () => {
        if (!user) return;
        if (!mealName.trim()) {
            setSaveTemplateError('Meal name is required');
            return;
        }

        const parsedCaloriesRaw = parseNumberInput(calories);
        if (Number.isNaN(parsedCaloriesRaw) || parsedCaloriesRaw < 0) {
            setSaveTemplateError('Valid calories value is required');
            return;
        }

        const parsedProteinRaw = protein ? parseNumberInput(protein) : 0;
        const parsedCarbsRaw = carbs ? parseNumberInput(carbs) : 0;
        const parsedFatsRaw = fats ? parseNumberInput(fats) : 0;

        if (Number.isNaN(parsedProteinRaw) || parsedProteinRaw < 0) {
            setSaveTemplateError('Valid protein value is required');
            return;
        }
        if (Number.isNaN(parsedCarbsRaw) || parsedCarbsRaw < 0) {
            setSaveTemplateError('Valid carbs value is required');
            return;
        }
        if (Number.isNaN(parsedFatsRaw) || parsedFatsRaw < 0) {
            setSaveTemplateError('Valid fats value is required');
            return;
        }

        setIsSavingTemplate(true);
        setSaveTemplateError(null);

        try {
            const parsedCalories = Math.round(parsedCaloriesRaw);
            const parsedProtein = Math.round(parsedProteinRaw);
            const parsedCarbs = Math.round(parsedCarbsRaw);
            const parsedFats = Math.round(parsedFatsRaw);

            // Check if a saved meal with the same name already exists
            const existingMeal = savedMeals.find(meal => meal.meal_name.trim() === mealName.trim());

            if (existingMeal) {
                // Update existing saved meal
                await updateSavedMeal(user.id, existingMeal.id, {
                    meal_name: mealName.trim(),
                    calories: parsedCalories,
                    protein: parsedProtein,
                    carbs: parsedCarbs,
                    fats: parsedFats,
                });
            } else {
                // Create new saved meal
                await createSavedMeal(user.id, {
                    meal_name: mealName.trim(),
                    calories: parsedCalories,
                    protein: parsedProtein,
                    carbs: parsedCarbs,
                    fats: parsedFats,
                });
            }

            // Reload saved meals
            const updatedSavedMeals = await getSavedMeals(user.id);
            setSavedMeals(updatedSavedMeals);
        } catch (error) {
            console.error('Failed to save template:', error);
            setSaveTemplateError('Failed to save template. Please try again.');
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const handleAnalyzeMeal = async () => {
        if (!mealDescription.trim()) return;

        if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
            setAiEstimateError(
                'Meal analysis requires a Gemini API key. Add NEXT_PUBLIC_GEMINI_API_KEY to enable this feature.'
            );
            return;
        }

        setIsAnalyzingMeal(true);
        setAiEstimateError(null);

        try {
            const prompt = `You estimate nutrition facts. Return JSON like {"calories":120, "protein":8, "carbs":15, "fats":4} with whole numbers.
If data is missing, best-guess typical values. Description: ${mealDescription.trim()}`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash-001',
                contents: prompt,
            });

            let rawText = response.text ?? '';

            if (!rawText && response.candidates?.length) {
                const firstCandidate = response.candidates[0];
                rawText =
                    firstCandidate.content?.parts
                        ?.map(part => ('text' in part && typeof part.text === 'string' ? part.text : ''))
                        .join('') ?? '';
            }

            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Unable to parse AI response');
            }

            const parsed = JSON.parse(jsonMatch[0]) as Partial<
                Record<'calories' | 'protein' | 'carbs' | 'fats', unknown>
            >;

            const sanitize = (value: unknown) =>
                typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;

            setCalories(String(sanitize(parsed.calories)));
            setProtein(String(sanitize(parsed.protein)));
            setCarbs(String(sanitize(parsed.carbs)));
            setFats(String(sanitize(parsed.fats)));
        } catch (error) {
            console.error('Failed to analyze meal with AI:', error);
            setAiEstimateError('Unable to analyze the meal description. Please adjust the details and try again.');
        } finally {
            setIsAnalyzingMeal(false);
        }
    };

    const handleAddMeal = async () => {
        if (!user) return;
        if (!mealName.trim()) return;

        const parsedCaloriesRaw = parseNumberInput(calories);
        const parsedProteinRaw = protein ? parseNumberInput(protein) : 0;
        const parsedCarbsRaw = carbs ? parseNumberInput(carbs) : 0;
        const parsedFatsRaw = fats ? parseNumberInput(fats) : 0;

        if (Number.isNaN(parsedCaloriesRaw) || parsedCaloriesRaw < 0) return;
        if (Number.isNaN(parsedProteinRaw) || parsedProteinRaw < 0) return;
        if (Number.isNaN(parsedCarbsRaw) || parsedCarbsRaw < 0) return;
        if (Number.isNaN(parsedFatsRaw) || parsedFatsRaw < 0) return;

        const parsedCalories = Math.round(parsedCaloriesRaw);
        const parsedProtein = Math.round(parsedProteinRaw);
        const parsedCarbs = Math.round(parsedCarbsRaw);
        const parsedFats = Math.round(parsedFatsRaw);

        const mealInput: MealInput & { id?: string } = {
            meal_time: combineDateAndTime(selectedDate, mealTime || '12:00'),
            meal_name: mealName.trim(),
            calories: parsedCalories,
            protein: parsedProtein,
            carbs: parsedCarbs,
            fats: parsedFats,
            notes: notes.trim() || undefined,
        };

        // If editing, include the meal ID
        if (editingMealId) {
            mealInput.id = editingMealId;
        }

        setIsSaving(true);
        try {
            await upsertMeal(user.id, mealInput);
            const start = startOfMonday(selectedDate);
            const end = endOfSunday(selectedDate);
            const updatedMeals = await getMealsForRange(user.id, start, end);
            const trendStart = new Date(start);
            trendStart.setDate(trendStart.getDate() - 42);
            const updatedTotals = await getDailyTotalsForRange(user.id, trendStart, end);
            setMeals(updatedMeals);
            setDailyTotals(updatedTotals);
            resetForm();
        } catch (error) {
            console.error('Failed to save meal:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteMeal = async (mealId: string) => {
        if (!user) return;
        setIsDeleting(mealId);
        try {
            await deleteMeal(user.id, mealId);
            const start = startOfMonday(selectedDate);
            const end = endOfSunday(selectedDate);
            const updatedMeals = await getMealsForRange(user.id, start, end);
            const trendStart = new Date(start);
            trendStart.setDate(trendStart.getDate() - 42);
            const updatedTotals = await getDailyTotalsForRange(user.id, trendStart, end);
            setMeals(updatedMeals);
            setDailyTotals(updatedTotals);
        } catch (error) {
            console.error('Failed to delete meal:', error);
        } finally {
            setIsDeleting(null);
        }
    };

    if (isLoading) {
        return (
            <div className='min-h-screen bg-slate-800 flex items-center justify-center'>
                <div className='flex flex-col items-center gap-4'>
                    <SpinnerIcon className='w-12 h-12 text-white animate-spin' />
                    <div className='text-white text-xl'>Loading food diary...</div>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className='min-h-screen bg-slate-800 flex items-center justify-center'>
                <div className='text-white text-lg'>Please return to the home page to sign in.</div>
            </div>
        );
    }

    return (
        <div className='min-h-screen bg-slate-800'>
            <div className='container mx-auto px-4 py-4 sm:py-8 max-w-4xl'>
                <div className='grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-8 mb-6'>
                    <div className='hidden sm:block w-36'></div>
                    <div className='text-center max-w-2xl mx-auto'>
                        <h1 className='text-2xl sm:text-4xl font-bold text-white mb-1'>Food Diary</h1>
                        <p className='text-white/80 text-sm sm:text-base'>
                            Log meals, track macros, and visualize your daily calorie trends.
                        </p>
                    </div>
                    <div className='flex justify-start sm:justify-end w-full sm:w-36'>
                        <Link
                            href='/'
                            className='text-sm sm:text-base text-slate-300 hover:text-white border border-slate-600 hover:border-slate-400 px-3 py-2 rounded-lg transition-colors flex items-center gap-2'
                        >
                            <ArrowLeftIcon className='w-4 h-4' aria-hidden='true' />
                            <span>Back</span>
                        </Link>
                    </div>
                </div>

                <div className='bg-slate-700 rounded-lg p-4 sm:p-6 mb-6'>
                    <h2 className='text-white text-lg font-semibold mb-4'>Add Meal</h2>
                    {savedMeals.length > 0 && (
                        <div className='mb-4'>
                            <label className='block text-sm text-white mb-2'>Select saved meal (optional)</label>
                            <div className='relative'>
                                <select
                                    value={selectedSavedMealId}
                                    onChange={event => handleSavedMealSelect(event.target.value)}
                                    className='w-full h-12 px-3 pr-12 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white cursor-pointer appearance-none'
                                >
                                    <option value=''>-- Select a saved meal --</option>
                                    {savedMeals.map(meal => (
                                        <option key={meal.id} value={meal.id}>
                                            {meal.meal_name} ({meal.calories} cal)
                                        </option>
                                    ))}
                                </select>
                                <div className='absolute inset-y-0 right-2 flex items-center pointer-events-none'>
                                    <ChevronDownIcon className='w-5 h-5 text-slate-200' />
                                </div>
                            </div>
                        </div>
                    )}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div>
                            <label className='block text-sm text-white mb-2'>Date</label>
                            <div className='relative' ref={datePickerRef}>
                                <input
                                    type='text'
                                    value={formatDateInput(selectedDate)}
                                    onChange={event => {
                                        if (!event.target.value) return;
                                        setSelectedDate(parseDateInput(event.target.value));
                                    }}
                                    onFocus={() => setIsDatePickerOpen(true)}
                                    onClick={() => setIsDatePickerOpen(true)}
                                    autoComplete='off'
                                    className='w-full h-12 px-3 pr-12 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white cursor-pointer selection:bg-blue-500/40'
                                />
                                <button
                                    type='button'
                                    aria-label='Select date'
                                    onClick={() => setIsDatePickerOpen(open => !open)}
                                    className='absolute inset-y-0 right-2 flex items-center text-slate-200 hover:text-white transition-colors'
                                >
                                    <CalendarIcon className='w-5 h-5' />
                                </button>
                                {isDatePickerOpen && (
                                    <div className='absolute right-0 z-30 mt-2 w-72 rounded-lg border border-slate-600 bg-slate-800 p-3 shadow-lg'>
                                        <div className='mb-2 flex items-center justify-between'>
                                            <button
                                                type='button'
                                                onClick={() =>
                                                    setDatePickerMonth(current => {
                                                        const next = new Date(current);
                                                        next.setMonth(current.getMonth() - 1);
                                                        return startOfMonth(next);
                                                    })
                                                }
                                                className='rounded-md px-2 py-1 text-slate-200 hover:bg-slate-700'
                                            >
                                                ‹
                                            </button>
                                            <div className='text-sm font-medium text-white'>
                                                {datePickerMonth.toLocaleDateString(undefined, {
                                                    month: 'long',
                                                    year: 'numeric',
                                                })}
                                            </div>
                                            <button
                                                type='button'
                                                onClick={() =>
                                                    setDatePickerMonth(current => {
                                                        const next = new Date(current);
                                                        next.setMonth(current.getMonth() + 1);
                                                        return startOfMonth(next);
                                                    })
                                                }
                                                className='rounded-md px-2 py-1 text-slate-200 hover:bg-slate-700'
                                            >
                                                ›
                                            </button>
                                        </div>
                                        <div className='grid grid-cols-7 gap-1 text-center text-xs text-slate-300'>
                                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(weekday => (
                                                <div key={weekday} className='py-1'>
                                                    {weekday}
                                                </div>
                                            ))}
                                        </div>
                                        <div className='mt-1 grid grid-cols-7 gap-1'>
                                            {calendarDays.map(day => {
                                                const dayKey = formatDateKey(day);
                                                const isCurrentMonth = day.getMonth() === datePickerMonth.getMonth();
                                                const isSelected = dayKey === formatDateKey(selectedDate);
                                                const isToday = dayKey === formatDateKey(new Date());

                                                let classes =
                                                    'w-full rounded-md px-0 py-2 text-sm font-medium transition-colors flex items-center justify-center';
                                                if (isSelected) {
                                                    classes += ' bg-blue-500 text-white hover:bg-blue-500';
                                                } else if (isToday) {
                                                    classes +=
                                                        ' border border-blue-400 text-white hover:bg-blue-600/40';
                                                } else {
                                                    classes += ' text-slate-200 hover:bg-slate-600/80';
                                                }

                                                if (!isCurrentMonth) {
                                                    classes += ' text-slate-400/70';
                                                }

                                                return (
                                                    <button
                                                        key={dayKey}
                                                        type='button'
                                                        onClick={() => {
                                                            const next = new Date(day);
                                                            setSelectedDate(next);
                                                            setIsDatePickerOpen(false);
                                                        }}
                                                        className={classes}
                                                    >
                                                        {day.getDate()}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className='block text-sm text-white mb-2'>Time</label>
                            <div className='relative' ref={timePickerRef}>
                                <input
                                    type='text'
                                    value={mealTime}
                                    onFocus={() => setIsTimePickerOpen(true)}
                                    onClick={() => setIsTimePickerOpen(true)}
                                    onChange={event => setMealTime(normalizeTimeInput(event.target.value))}
                                    placeholder='HH:MM'
                                    autoComplete='off'
                                    className='w-full h-12 px-3 pr-12 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white selection:bg-blue-500/40'
                                />
                                <button
                                    type='button'
                                    aria-label='Select time'
                                    onClick={() => setIsTimePickerOpen(open => !open)}
                                    className='absolute inset-y-0 right-2 flex items-center text-slate-200 hover:text-white transition-colors'
                                >
                                    <ClockIcon className='w-5 h-5' />
                                </button>
                                {isTimePickerOpen && (
                                    <div className='absolute right-0 z-30 mt-2 max-h-64 w-40 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 p-2 shadow-lg'>
                                        {timeOptions.map(option => {
                                            const isSelected = option === mealTime;
                                            return (
                                                <button
                                                    key={option}
                                                    type='button'
                                                    onClick={() => {
                                                        setMealTime(option);
                                                        setIsTimePickerOpen(false);
                                                    }}
                                                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                                                        isSelected
                                                            ? 'bg-blue-500 text-white'
                                                            : 'text-slate-200 hover:bg-slate-600/80'
                                                    }`}
                                                >
                                                    <span>{option}</span>
                                                    {isSelected && <span className='text-xs text-white/80'>✓</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className='md:col-span-2'>
                            <label className='block text-sm text-white mb-2'>Meal name</label>
                            <input
                                type='text'
                                value={mealName}
                                onChange={event => setMealName(event.target.value)}
                                placeholder='Breakfast smoothie, Lunch salad...'
                                className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white placeholder-slate-400'
                            />
                        </div>
                        <div className='md:col-span-2'>
                            <label className='block text-sm text-white mb-2'>Meal description for AI (optional)</label>
                            <textarea
                                value={mealDescription}
                                onChange={event => setMealDescription(event.target.value)}
                                rows={3}
                                placeholder='e.g., Grilled salmon with brown rice and steamed broccoli, medium portion'
                                className='w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white placeholder-slate-400'
                            />
                        </div>
                        <div className='md:col-span-2 flex flex-col gap-2'>
                            <button
                                type='button'
                                onClick={handleAnalyzeMeal}
                                disabled={isAnalyzingMeal || !mealDescription.trim()}
                                className='inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-500/80 hover:bg-purple-500 text-white transition-colors cursor-pointer disabled:bg-slate-600 disabled:text-slate-300 disabled:cursor-not-allowed'
                            >
                                {isAnalyzingMeal ? 'Analyzing meal…' : 'Analyze with AI'}
                            </button>
                            {aiEstimateError ? (
                                <p className='text-sm text-red-300'>{aiEstimateError}</p>
                            ) : (
                                <p className='text-xs text-slate-300'>
                                    AI will suggest calories and macros based on the description. You can edit the
                                    values before saving.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className='block text-sm text-white mb-2'>Calories</label>
                            <input
                                type='number'
                                min='0'
                                value={calories}
                                onChange={event => setCalories(event.target.value)}
                                className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white'
                            />
                        </div>
                        <div>
                            <label className='block text-sm text-white mb-2'>Protein (g)</label>
                            <input
                                type='number'
                                min='0'
                                value={protein}
                                onChange={event => setProtein(event.target.value)}
                                className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white'
                            />
                        </div>
                        <div>
                            <label className='block text-sm text-white mb-2'>Carbs (g)</label>
                            <input
                                type='number'
                                min='0'
                                value={carbs}
                                onChange={event => setCarbs(event.target.value)}
                                className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white'
                            />
                        </div>
                        <div>
                            <label className='block text-sm text-white mb-2'>Fats (g)</label>
                            <input
                                type='number'
                                min='0'
                                value={fats}
                                onChange={event => setFats(event.target.value)}
                                className='w-full h-12 px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white'
                            />
                        </div>
                        <div className='md:col-span-2'>
                            <label className='block text-sm text-white mb-2'>Notes (optional)</label>
                            <textarea
                                value={notes}
                                onChange={event => setNotes(event.target.value)}
                                rows={3}
                                className='w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-600 text-white'
                            />
                        </div>
                    </div>
                    <div className='mt-4 flex justify-end gap-3'>
                        {editingMealId ? (
                            <>
                                <button
                                    onClick={resetForm}
                                    disabled={isSaving}
                                    className='px-4 py-2 bg-slate-600/80 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer'
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddMeal}
                                    disabled={isSaving || !mealName.trim() || !calories}
                                    className='px-4 py-2 bg-blue-500/80 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed cursor-pointer'
                                >
                                    {isSaving ? 'Updating...' : 'Update Meal'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={handleSaveAsTemplate}
                                    disabled={isSavingTemplate || !mealName.trim() || !calories}
                                    className='px-4 py-2 bg-slate-600/80 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer'
                                >
                                    {isSavingTemplate ? 'Saving...' : 'Save as Template'}
                                </button>
                                <button
                                    onClick={handleAddMeal}
                                    disabled={isSaving || !mealName.trim() || !calories}
                                    className='px-4 py-2 bg-blue-500/80 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed cursor-pointer'
                                >
                                    {isSaving ? 'Saving...' : 'Add Meal'}
                                </button>
                            </>
                        )}
                    </div>
                    {saveTemplateError && <div className='mt-2 text-sm text-red-300'>{saveTemplateError}</div>}
                </div>

                <div className='space-y-3 sm:space-y-4 mb-6'>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4'>
                        <div className='bg-slate-700 rounded-lg p-4 text-center'>
                            <h3 className='text-sm sm:text-base font-semibold text-white mb-1'>
                                Weekly average calories
                            </h3>
                            <p className='text-2xl sm:text-3xl font-bold text-blue-400'>{weeklyAverages.avgCalories}</p>
                        </div>
                        <div className='bg-slate-700 rounded-lg p-4 text-center'>
                            <h3 className='text-sm sm:text-base font-semibold text-white mb-1'>
                                Weekly average macros
                            </h3>
                            <p className='text-lg sm:text-xl font-semibold'>
                                <span style={{ color: MACRO_COLORS.protein }}>{weeklyAverages.avgProtein}g</span>
                                {' / '}
                                <span style={{ color: MACRO_COLORS.carbs }}>{weeklyAverages.avgCarbs}g</span>
                                {' / '}
                                <span style={{ color: MACRO_COLORS.fats }}>{weeklyAverages.avgFats}g</span>
                            </p>
                        </div>
                    </div>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4'>
                        <div className='bg-slate-700 rounded-lg p-4 text-center'>
                            <h3 className='text-sm sm:text-base font-semibold text-white mb-1'>Calories today</h3>
                            <p className='text-2xl sm:text-3xl font-bold text-orange-400'>
                                {totalsForSelectedDay?.total_calories ?? 0}
                            </p>
                        </div>
                        <div className='bg-slate-700 rounded-lg p-4 text-center'>
                            <h3 className='text-sm sm:text-base font-semibold text-white mb-1'>Today&apos;s macros</h3>
                            <p className='text-lg sm:text-xl font-semibold'>
                                {totalsForSelectedDay ? (
                                    <>
                                        <span style={{ color: MACRO_COLORS.protein }}>
                                            {totalsForSelectedDay.total_protein}g
                                        </span>
                                        {' / '}
                                        <span style={{ color: MACRO_COLORS.carbs }}>
                                            {totalsForSelectedDay.total_carbs}g
                                        </span>
                                        {' / '}
                                        <span style={{ color: MACRO_COLORS.fats }}>
                                            {totalsForSelectedDay.total_fats}g
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ color: MACRO_COLORS.protein }}>0g</span>
                                        {' / '}
                                        <span style={{ color: MACRO_COLORS.carbs }}>0g</span>
                                        {' / '}
                                        <span style={{ color: MACRO_COLORS.fats }}>0g</span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                <div className='bg-slate-700 rounded-lg p-4 sm:p-6 mb-6'>
                    <h2 className='text-white text-lg font-semibold mb-4'>Meals this week</h2>
                    <div className='overflow-x-auto'>
                        <table className='min-w-full text-left'>
                            <thead>
                                <tr className='text-slate-300 text-sm uppercase tracking-wide'>
                                    <th className='px-3 py-2'>Date</th>
                                    <th className='px-3 py-2'>Time</th>
                                    <th className='px-3 py-2'>Meal</th>
                                    <th className='px-3 py-2 text-right'>Calories</th>
                                    <th className='px-3 py-2 text-right'>Protein</th>
                                    <th className='px-3 py-2 text-right'>Carbs</th>
                                    <th className='px-3 py-2 text-right'>Fats</th>
                                    <th className='px-3 py-2'>Notes</th>
                                    <th className='px-3 py-2 text-right'>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentWeek.map(date => {
                                    const key = formatDateInput(date);
                                    const rows = mealsByDay[key] ?? [];
                                    const totals = totalsByDay[key];

                                    return (
                                        <Fragment key={key}>
                                            <tr className='bg-slate-800/60'>
                                                <td className='px-3 py-2 text-white font-medium' colSpan={3}>
                                                    {date.toLocaleDateString(undefined, {
                                                        weekday: 'short',
                                                        month: 'short',
                                                        day: 'numeric',
                                                    })}
                                                </td>
                                                <td className='px-3 py-2 text-right text-white font-semibold'>
                                                    {totals?.total_calories ?? 0}
                                                </td>
                                                <td className='px-3 py-2 text-right text-white'>
                                                    {totals?.total_protein ?? 0}g
                                                </td>
                                                <td className='px-3 py-2 text-right text-white'>
                                                    {totals?.total_carbs ?? 0}g
                                                </td>
                                                <td className='px-3 py-2 text-right text-white'>
                                                    {totals?.total_fats ?? 0}g
                                                </td>
                                                <td className='px-3 py-2 text-slate-300' colSpan={2}>
                                                    Daily totals
                                                </td>
                                            </tr>
                                            {rows.length === 0 ? (
                                                <tr>
                                                    <td className='px-3 py-3 text-slate-400' colSpan={9}>
                                                        No meals logged.
                                                    </td>
                                                </tr>
                                            ) : (
                                                rows.map(meal => {
                                                    const mealDate = new Date(meal.meal_time);
                                                    return (
                                                        <tr key={meal.id} className='border-t border-slate-600/50'>
                                                            <td className='px-3 py-2 text-slate-200'>
                                                                {mealDate.toLocaleDateString()}
                                                            </td>
                                                            <td className='px-3 py-2 text-slate-200'>
                                                                {formatMealTime(meal.meal_time)}
                                                            </td>
                                                            <td className='px-3 py-2 text-white font-medium'>
                                                                {meal.meal_name}
                                                            </td>
                                                            <td className='px-3 py-2 text-right text-slate-200'>
                                                                {meal.calories}
                                                            </td>
                                                            <td className='px-3 py-2 text-right text-slate-200'>
                                                                {meal.protein}g
                                                            </td>
                                                            <td className='px-3 py-2 text-right text-slate-200'>
                                                                {meal.carbs}g
                                                            </td>
                                                            <td className='px-3 py-2 text-right text-slate-200'>
                                                                {meal.fats}g
                                                            </td>
                                                            <td className='px-3 py-2 text-slate-300 max-w-[200px] truncate'>
                                                                {meal.notes ?? '—'}
                                                            </td>
                                                            <td className='px-3 py-2 text-right'>
                                                                <div className='flex justify-end relative'>
                                                                    <button
                                                                        onClick={() =>
                                                                            setMenuOpenMealId(
                                                                                menuOpenMealId === meal.id
                                                                                    ? null
                                                                                    : meal.id
                                                                            )
                                                                        }
                                                                        className='text-slate-300 py-1 px-2 hover:text-white text-xl font-bold cursor-pointer'
                                                                        aria-haspopup='menu'
                                                                        aria-expanded={menuOpenMealId === meal.id}
                                                                        aria-label='Meal options'
                                                                    >
                                                                        ⋯
                                                                    </button>
                                                                    {menuOpenMealId === meal.id && (
                                                                        <div
                                                                            ref={el => {
                                                                                menuRefs.current[meal.id] = el;
                                                                            }}
                                                                            className='absolute z-10 mt-1 right-0 bg-slate-800 border border-slate-700 rounded-md shadow-lg w-32 text-sm'
                                                                        >
                                                                            <button
                                                                                className='w-full text-left px-3 py-2 hover:bg-slate-700 text-white cursor-pointer rounded-t-md'
                                                                                onClick={() => handleEditMeal(meal)}
                                                                            >
                                                                                Edit
                                                                            </button>
                                                                            <button
                                                                                className='w-full text-left px-3 py-2 hover:bg-slate-700 text-red-400 hover:text-red-300 cursor-pointer rounded-b-md'
                                                                                onClick={() => {
                                                                                    handleDeleteMeal(meal.id);
                                                                                    setMenuOpenMealId(null);
                                                                                }}
                                                                                disabled={isDeleting === meal.id}
                                                                            >
                                                                                {isDeleting === meal.id
                                                                                    ? 'Removing...'
                                                                                    : 'Remove'}
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {dailyTrend.length > 0 && (
                    <>
                        <div className='bg-slate-700 rounded-lg p-4 sm:p-6 mb-6'>
                            <h3 className='text-lg font-semibold text-white mb-4 flex items-center'>
                                🔥 Daily Calories Trend
                            </h3>
                            <div className='bg-slate-800 rounded-lg pb-2'>
                                <div className='relative h-32 sm:h-40'>
                                    <svg
                                        className='absolute inset-0 w-full h-full'
                                        style={{ zIndex: 10, overflow: 'visible' }}
                                    >
                                        {dailyTrend.map((point, index) => {
                                            if (index === 0) return null;
                                            const prevPoint = dailyTrend[index - 1];
                                            const barWidth = 100 / dailyTrend.length;
                                            const prevX = (index - 1) * barWidth + barWidth / 2;
                                            const currentX = index * barWidth + barWidth / 2;
                                            const topPadding = 10;
                                            const chartHeight = 85;
                                            const prevHeight =
                                                maxTrendCalories > 0
                                                    ? (prevPoint.calories / maxTrendCalories) * chartHeight
                                                    : 0;
                                            const currentHeight =
                                                maxTrendCalories > 0
                                                    ? (point.calories / maxTrendCalories) * chartHeight
                                                    : 0;
                                            const prevY = topPadding + (chartHeight - prevHeight);
                                            const currentY = topPadding + (chartHeight - currentHeight);

                                            return (
                                                <line
                                                    key={`cal-line-${index}`}
                                                    x1={`${prevX}%`}
                                                    y1={`${prevY}%`}
                                                    x2={`${currentX}%`}
                                                    y2={`${currentY}%`}
                                                    stroke='#f97316'
                                                    strokeWidth='3'
                                                    strokeLinecap='round'
                                                />
                                            );
                                        })}

                                        {dailyTrend.map((point, index) => {
                                            const barWidth = 100 / dailyTrend.length;
                                            const x = index * barWidth + barWidth / 2;
                                            const topPadding = 10;
                                            const chartHeight = 85;
                                            const height =
                                                maxTrendCalories > 0
                                                    ? (point.calories / maxTrendCalories) * chartHeight
                                                    : 0;
                                            const y = topPadding + (chartHeight - height);
                                            const isToday = formatDateKey(new Date()) === point.date;

                                            return (
                                                <circle
                                                    key={`cal-point-${index}`}
                                                    cx={`${x}%`}
                                                    cy={`${y}%`}
                                                    r={isToday ? '6' : '4'}
                                                    fill='#f97316'
                                                    stroke={isToday ? '#ffffff' : '#1e293b'}
                                                    strokeWidth={isToday ? '3' : '2'}
                                                    className={isToday ? 'animate-pulse' : ''}
                                                />
                                            );
                                        })}
                                    </svg>
                                </div>
                                <div className='flex justify-between mt-3'>
                                    {dailyTrend.map(point => {
                                        const trendDate = new Date(point.date);
                                        const label = trendDate.toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                        });
                                        return (
                                            <div
                                                key={point.date}
                                                className='flex flex-col items-center flex-1 text-center'
                                            >
                                                <div className='text-xs font-medium text-white mb-1'>
                                                    {point.calories}
                                                </div>
                                                <div className='text-xs text-slate-300'>{label}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className='bg-slate-700 rounded-lg p-4 sm:p-6 mb-6'>
                            <h3 className='text-lg font-semibold text-white mb-4 flex items-center'>
                                💪 Daily Protein Trend
                            </h3>
                            <div className='bg-slate-800 rounded-lg pb-2'>
                                <div className='relative h-32 sm:h-40'>
                                    <svg
                                        className='absolute inset-0 w-full h-full'
                                        style={{ zIndex: 10, overflow: 'visible' }}
                                    >
                                        {dailyTrend.map((point, index) => {
                                            if (index === 0) return null;
                                            const prevPoint = dailyTrend[index - 1];
                                            const barWidth = 100 / dailyTrend.length;
                                            const prevX = (index - 1) * barWidth + barWidth / 2;
                                            const currentX = index * barWidth + barWidth / 2;
                                            const topPadding = 10;
                                            const chartHeight = 85;
                                            const prevHeight =
                                                maxTrendProtein > 0
                                                    ? (prevPoint.protein / maxTrendProtein) * chartHeight
                                                    : 0;
                                            const currentHeight =
                                                maxTrendProtein > 0
                                                    ? (point.protein / maxTrendProtein) * chartHeight
                                                    : 0;
                                            const prevY = topPadding + (chartHeight - prevHeight);
                                            const currentY = topPadding + (chartHeight - currentHeight);

                                            return (
                                                <line
                                                    key={`protein-line-${index}`}
                                                    x1={`${prevX}%`}
                                                    y1={`${prevY}%`}
                                                    x2={`${currentX}%`}
                                                    y2={`${currentY}%`}
                                                    stroke={MACRO_COLORS.protein}
                                                    strokeWidth='3'
                                                    strokeLinecap='round'
                                                />
                                            );
                                        })}

                                        {dailyTrend.map((point, index) => {
                                            const barWidth = 100 / dailyTrend.length;
                                            const x = index * barWidth + barWidth / 2;
                                            const topPadding = 10;
                                            const chartHeight = 85;
                                            const height =
                                                maxTrendProtein > 0
                                                    ? (point.protein / maxTrendProtein) * chartHeight
                                                    : 0;
                                            const y = topPadding + (chartHeight - height);
                                            const isToday = formatDateKey(new Date()) === point.date;

                                            return (
                                                <circle
                                                    key={`protein-point-${index}`}
                                                    cx={`${x}%`}
                                                    cy={`${y}%`}
                                                    r={isToday ? '6' : '4'}
                                                    fill={MACRO_COLORS.protein}
                                                    stroke={isToday ? '#ffffff' : '#1e293b'}
                                                    strokeWidth={isToday ? '3' : '2'}
                                                    className={isToday ? 'animate-pulse' : ''}
                                                />
                                            );
                                        })}
                                    </svg>
                                </div>
                                <div className='flex justify-between mt-3'>
                                    {dailyTrend.map(point => {
                                        const trendDate = new Date(point.date);
                                        const label = trendDate.toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                        });
                                        return (
                                            <div
                                                key={point.date}
                                                className='flex flex-col items-center flex-1 text-center'
                                            >
                                                <div className='text-xs font-medium text-white mb-1'>
                                                    {point.protein}g
                                                </div>
                                                <div className='text-xs text-slate-300'>{label}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className='bg-slate-700 rounded-lg p-4 sm:p-6 mb-6'>
                            <h3 className='text-lg font-semibold text-white mb-4 flex items-center'>
                                🍞 Daily Carbs Trend
                            </h3>
                            <div className='bg-slate-800 rounded-lg pb-2'>
                                <div className='relative h-32 sm:h-40'>
                                    <svg
                                        className='absolute inset-0 w-full h-full'
                                        style={{ zIndex: 10, overflow: 'visible' }}
                                    >
                                        {dailyTrend.map((point, index) => {
                                            if (index === 0) return null;
                                            const prevPoint = dailyTrend[index - 1];
                                            const barWidth = 100 / dailyTrend.length;
                                            const prevX = (index - 1) * barWidth + barWidth / 2;
                                            const currentX = index * barWidth + barWidth / 2;
                                            const topPadding = 10;
                                            const chartHeight = 85;
                                            const prevHeight =
                                                maxTrendCarbs > 0 ? (prevPoint.carbs / maxTrendCarbs) * chartHeight : 0;
                                            const currentHeight =
                                                maxTrendCarbs > 0 ? (point.carbs / maxTrendCarbs) * chartHeight : 0;
                                            const prevY = topPadding + (chartHeight - prevHeight);
                                            const currentY = topPadding + (chartHeight - currentHeight);

                                            return (
                                                <line
                                                    key={`carbs-line-${index}`}
                                                    x1={`${prevX}%`}
                                                    y1={`${prevY}%`}
                                                    x2={`${currentX}%`}
                                                    y2={`${currentY}%`}
                                                    stroke={MACRO_COLORS.carbs}
                                                    strokeWidth='3'
                                                    strokeLinecap='round'
                                                />
                                            );
                                        })}

                                        {dailyTrend.map((point, index) => {
                                            const barWidth = 100 / dailyTrend.length;
                                            const x = index * barWidth + barWidth / 2;
                                            const topPadding = 10;
                                            const chartHeight = 85;
                                            const height =
                                                maxTrendCarbs > 0 ? (point.carbs / maxTrendCarbs) * chartHeight : 0;
                                            const y = topPadding + (chartHeight - height);
                                            const isToday = formatDateKey(new Date()) === point.date;

                                            return (
                                                <circle
                                                    key={`carbs-point-${index}`}
                                                    cx={`${x}%`}
                                                    cy={`${y}%`}
                                                    r={isToday ? '6' : '4'}
                                                    fill={MACRO_COLORS.carbs}
                                                    stroke={isToday ? '#ffffff' : '#1e293b'}
                                                    strokeWidth={isToday ? '3' : '2'}
                                                    className={isToday ? 'animate-pulse' : ''}
                                                />
                                            );
                                        })}
                                    </svg>
                                </div>
                                <div className='flex justify-between mt-3'>
                                    {dailyTrend.map(point => {
                                        const trendDate = new Date(point.date);
                                        const label = trendDate.toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                        });
                                        return (
                                            <div
                                                key={point.date}
                                                className='flex flex-col items-center flex-1 text-center'
                                            >
                                                <div className='text-xs font-medium text-white mb-1'>
                                                    {point.carbs}g
                                                </div>
                                                <div className='text-xs text-slate-300'>{label}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className='bg-slate-700 rounded-lg p-4 sm:p-6 mb-6'>
                            <h3 className='text-lg font-semibold text-white mb-4 flex items-center'>
                                🧈 Daily Fats Trend
                            </h3>
                            <div className='bg-slate-800 rounded-lg pb-2'>
                                <div className='relative h-32 sm:h-40'>
                                    <svg
                                        className='absolute inset-0 w-full h-full'
                                        style={{ zIndex: 10, overflow: 'visible' }}
                                    >
                                        {dailyTrend.map((point, index) => {
                                            if (index === 0) return null;
                                            const prevPoint = dailyTrend[index - 1];
                                            const barWidth = 100 / dailyTrend.length;
                                            const prevX = (index - 1) * barWidth + barWidth / 2;
                                            const currentX = index * barWidth + barWidth / 2;
                                            const topPadding = 10;
                                            const chartHeight = 85;
                                            const prevHeight =
                                                maxTrendFats > 0 ? (prevPoint.fats / maxTrendFats) * chartHeight : 0;
                                            const currentHeight =
                                                maxTrendFats > 0 ? (point.fats / maxTrendFats) * chartHeight : 0;
                                            const prevY = topPadding + (chartHeight - prevHeight);
                                            const currentY = topPadding + (chartHeight - currentHeight);

                                            return (
                                                <line
                                                    key={`fats-line-${index}`}
                                                    x1={`${prevX}%`}
                                                    y1={`${prevY}%`}
                                                    x2={`${currentX}%`}
                                                    y2={`${currentY}%`}
                                                    stroke={MACRO_COLORS.fats}
                                                    strokeWidth='3'
                                                    strokeLinecap='round'
                                                />
                                            );
                                        })}

                                        {dailyTrend.map((point, index) => {
                                            const barWidth = 100 / dailyTrend.length;
                                            const x = index * barWidth + barWidth / 2;
                                            const topPadding = 10;
                                            const chartHeight = 85;
                                            const height =
                                                maxTrendFats > 0 ? (point.fats / maxTrendFats) * chartHeight : 0;
                                            const y = topPadding + (chartHeight - height);
                                            const isToday = formatDateKey(new Date()) === point.date;

                                            return (
                                                <circle
                                                    key={`fats-point-${index}`}
                                                    cx={`${x}%`}
                                                    cy={`${y}%`}
                                                    r={isToday ? '6' : '4'}
                                                    fill={MACRO_COLORS.fats}
                                                    stroke={isToday ? '#ffffff' : '#1e293b'}
                                                    strokeWidth={isToday ? '3' : '2'}
                                                    className={isToday ? 'animate-pulse' : ''}
                                                />
                                            );
                                        })}
                                    </svg>
                                </div>
                                <div className='flex justify-between mt-3'>
                                    {dailyTrend.map(point => {
                                        const trendDate = new Date(point.date);
                                        const label = trendDate.toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                        });
                                        return (
                                            <div
                                                key={point.date}
                                                className='flex flex-col items-center flex-1 text-center'
                                            >
                                                <div className='text-xs font-medium text-white mb-1'>{point.fats}g</div>
                                                <div className='text-xs text-slate-300'>{label}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
