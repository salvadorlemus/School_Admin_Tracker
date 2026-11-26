import {supabase} from '../lib/supabase';

/** A row as the API returns it, read field by field. */
export type Row = Record<string, unknown>;

/** The few query-builder steps the live app uses. */
export interface Query {
    range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

    gte(column: string, value: string): Query;

    lte(column: string, value: string): Query;

    order(column: string, options: { ascending: boolean }): Query;

    limit(count: number): Query;

    eq(column: string, value: string): Query;
}

/** Every row of a table the signed-in person may read (the policies decide), page by page: the API returns at most 1000 a request. */
export async function rows(table: string, select = '*', filter?: (query: Query) => Query): Promise<Row[]> {
    let query = supabase.from(table).select(select) as unknown as Query;
    if (filter) query = filter(query);
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
        const {data, error} = await query.range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        out.push(...((data ?? []) as Row[]));
        if (!data || data.length < 1000) break;
    }
    return out;
}

/** A field as text ('' when empty) or as a number (0 when empty). */
export const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));
export const num = (value: unknown) => Number(value ?? 0);
