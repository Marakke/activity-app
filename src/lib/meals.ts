import { supabase } from '@/lib/supabase';

export interface Meal {
    id: string;
    user_id: string;
    meal_time: string;
    meal_name: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    notes?: string | null;
}

export interface MealInput {
    meal_time: string;
    meal_name: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    notes?: string;
}

export interface DailyTotals {
    meal_day: string;
    total_calories: number;
    total_protein: number;
    total_carbs: number;
    total_fats: number;
}

export async function getMealsForRange(userId: string, start: Date, end: Date): Promise<Meal[]> {
    const { data, error } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', userId)
        .gte('meal_time', start.toISOString())
        .lte('meal_time', end.toISOString())
        .order('meal_time', { ascending: true });

    if (error) {
        console.error('Error fetching meals:', error);
        throw error;
    }

    return data ?? [];
}

export async function upsertMeal(userId: string, meal: Partial<Meal> & MealInput & { id?: string }): Promise<Meal> {
    const roundNumeric = (value: number | null | undefined): number => {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return 0;
        }
        return Math.round(value);
    };

    const payload = {
        id: meal.id,
        user_id: userId,
        meal_time: meal.meal_time,
        meal_name: meal.meal_name,
        calories: roundNumeric(meal.calories),
        protein: roundNumeric(meal.protein),
        carbs: roundNumeric(meal.carbs),
        fats: roundNumeric(meal.fats),
        notes: meal.notes ?? null,
    };

    const { data, error } = await supabase.from('meals').upsert(payload).select().single();

    if (error) {
        console.error('Error saving meal:', error);
        throw error;
    }

    return data as Meal;
}

export async function deleteMeal(userId: string, mealId: string): Promise<void> {
    const { error } = await supabase.from('meals').delete().eq('user_id', userId).eq('id', mealId);

    if (error) {
        console.error('Error deleting meal:', error);
        throw error;
    }
}

export async function getDailyTotalsForRange(
    userId: string,
    start: Date,
    end: Date
): Promise<DailyTotals[]> {
    const { data, error } = await supabase
        .from('meal_daily_totals')
        .select('*')
        .eq('user_id', userId)
        .gte('meal_day', start.toISOString())
        .lte('meal_day', end.toISOString())
        .order('meal_day', { ascending: true });

    if (error) {
        console.error('Error fetching daily totals:', error);
        throw error;
    }

    return data ?? [];
}

