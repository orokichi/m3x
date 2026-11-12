/* Server-safe constant (no 'use client'). Keep key in sync with themeStore.ts. */
const CK = 'm3x.themeCss';
/** Inline <head> script: paints the cached scheme before hydration (no flash, no color lib). */
export const THEME_BOOT = `try{var c=JSON.parse(localStorage.getItem('${CK}'));if(c){var d=matchMedia('(prefers-color-scheme: dark)').matches,s=document.createElement('style');s.id='m3-theme';s.textContent=':root:root{'+(d?c.dark:c.light)+'color-scheme:'+(d?'dark':'light')+'}';document.head.appendChild(s);document.documentElement.dataset.dark=d?'1':'0'}}catch(e){}`;
