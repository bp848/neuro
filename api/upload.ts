export const config = {
    runtime: 'edge',
};

export default async function handler(req: Request) {
    return new Response(JSON.stringify({
        message: "Proxy to Supabase Storage. Use Supabase client directly in production for large files."
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
