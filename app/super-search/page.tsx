'use client';
import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui';

export default dynamic(() => import('@/components/SuperSearch'), { ssr: false, loading: () => <Spinner /> });
