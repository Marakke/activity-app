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

export interface SavedMeal {
    id: string;
    user_id: string;
    meal_name: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    created_at: string;
    updated_at: string;
}

export interface SavedMealInput {
    meal_name: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
}

export interface UserPreferences {
    user_id: string;
    daily_calories_goal: number | null;
    daily_protein_goal: number | null;
    daily_carbs_goal: number | null;
    daily_fats_goal: number | null;
    updated_at: string;
}

export interface UserPreferencesInput {
    daily_calories_goal?: number | null;
    daily_protein_goal?: number | null;
    daily_carbs_goal?: number | null;
    daily_fats_goal?: number | null;
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

export async function getDailyTotalsForRange(userId: string, start: Date, end: Date): Promise<DailyTotals[]> {
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

export async function getSavedMeals(userId: string): Promise<SavedMeal[]> {
    try {
        const { data, error } = await supabase
            .from('saved_meals')
            .select('*')
            .eq('user_id', userId)
            .order('meal_name', { ascending: true });

        if (error) {
            // If table doesn't exist yet (migration not run), return empty array
            const errorMessage = error.message || '';
            const errorCode = error.code || '';
            const errorString = JSON.stringify(error);
            const errorKeys = Object.keys(error);

            // Check for table doesn't exist errors
            if (
                errorCode === '42P01' ||
                errorCode === 'PGRST116' ||
                errorMessage.includes('does not exist') ||
                errorMessage.includes('relation') ||
                errorMessage.includes('Could not find') ||
                errorString.includes('does not exist') ||
                errorString.includes('relation') ||
                errorString.includes('Could not find') ||
                // If error object is empty or has no meaningful properties, likely table doesn't exist
                errorKeys.length === 0 ||
                (errorKeys.length === 1 && errorKeys[0] === 'hint')
            ) {
                console.warn('saved_meals table does not exist yet. Please run the migration.');
                return [];
            }
            console.error('Error fetching saved meals:', { error, message: errorMessage, code: errorCode });
            throw error;
        }

        return data ?? [];
    } catch (err) {
        // Catch any unexpected errors and handle gracefully
        console.warn('Failed to fetch saved meals (table may not exist):', err);
        return [];
    }
}

export async function createSavedMeal(userId: string, meal: SavedMealInput): Promise<SavedMeal> {
    const roundNumeric = (value: number | null | undefined): number => {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return 0;
        }
        return Math.round(value);
    };

    const payload = {
        user_id: userId,
        meal_name: meal.meal_name.trim(),
        calories: roundNumeric(meal.calories),
        protein: roundNumeric(meal.protein),
        carbs: roundNumeric(meal.carbs),
        fats: roundNumeric(meal.fats),
    };

    const { data, error } = await supabase.from('saved_meals').insert(payload).select().single();

    if (error) {
        // If table doesn't exist yet, provide helpful error message
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
            throw new Error('saved_meals table does not exist. Please run the database migration first.');
        }
        console.error('Error creating saved meal:', error);
        throw error;
    }

    return data as SavedMeal;
}

export async function updateSavedMeal(userId: string, mealId: string, meal: SavedMealInput): Promise<SavedMeal> {
    const roundNumeric = (value: number | null | undefined): number => {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return 0;
        }
        return Math.round(value);
    };

    const payload = {
        meal_name: meal.meal_name.trim(),
        calories: roundNumeric(meal.calories),
        protein: roundNumeric(meal.protein),
        carbs: roundNumeric(meal.carbs),
        fats: roundNumeric(meal.fats),
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('saved_meals')
        .update(payload)
        .eq('user_id', userId)
        .eq('id', mealId)
        .select()
        .single();

    if (error) {
        // If table doesn't exist yet, provide helpful error message
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
            throw new Error('saved_meals table does not exist. Please run the database migration first.');
        }
        console.error('Error updating saved meal:', error);
        throw error;
    }

    return data as SavedMeal;
}

export async function deleteSavedMeal(userId: string, mealId: string): Promise<void> {
    const { error } = await supabase.from('saved_meals').delete().eq('user_id', userId).eq('id', mealId);

    if (error) {
        console.error('Error deleting saved meal:', error);
        throw error;
    }
}

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
    try {
        const { data, error } = await supabase.from('user_preferences').select('*').eq('user_id', userId).single();

        if (error) {
            // If table doesn't exist yet (migration not run), return null
            const errorMessage = error.message || '';
            const errorCode = error.code || '';
            const errorString = JSON.stringify(error);
            const errorKeys = Object.keys(error);

            // Check for table doesn't exist errors or no rows found
            if (
                errorCode === '42P01' ||
                errorCode === 'PGRST116' ||
                errorCode === 'PGRST301' ||
                errorMessage.includes('does not exist') ||
                errorMessage.includes('relation') ||
                errorMessage.includes('Could not find') ||
                errorString.includes('does not exist') ||
                errorString.includes('relation') ||
                errorString.includes('Could not find') ||
                // If error object is empty or has no meaningful properties, likely table doesn't exist
                errorKeys.length === 0 ||
                (errorKeys.length === 1 && errorKeys[0] === 'hint')
            ) {
                console.warn(
                    'user_preferences table does not exist yet or no preferences found. Please run the migration.'
                );
                return null;
            }
            console.error('Error fetching user preferences:', { error, message: errorMessage, code: errorCode });
            throw error;
        }

        return data as UserPreferences | null;
    } catch (err) {
        // Catch any unexpected errors and handle gracefully
        console.warn('Failed to fetch user preferences (table may not exist):', err);
        return null;
    }
}

export async function upsertUserPreferences(
    userId: string,
    preferences: UserPreferencesInput
): Promise<UserPreferences> {
    const roundNumeric = (value: number | null | undefined): number | null => {
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return null;
        }
        return Math.round(value);
    };

    const payload = {
        user_id: userId,
        daily_calories_goal: roundNumeric(preferences.daily_calories_goal),
        daily_protein_goal: roundNumeric(preferences.daily_protein_goal),
        daily_carbs_goal: roundNumeric(preferences.daily_carbs_goal),
        daily_fats_goal: roundNumeric(preferences.daily_fats_goal),
        updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
        .from('user_preferences')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

    if (error) {
        // If table doesn't exist yet, provide helpful error message
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
            throw new Error('user_preferences table does not exist. Please run the database migration first.');
        }
        console.error('Error saving user preferences:', error);
        throw error;
    }

    return data as UserPreferences;
}
