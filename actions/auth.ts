'use server';

import { redirect } from 'next/navigation';

export async function logout() {
  // Clear auth token on client side via JavaScript
  redirect('/login');
}
