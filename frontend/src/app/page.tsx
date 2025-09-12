'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Select from 'react-select';
import { motion } from 'framer-motion';
import { useAddressStore } from '@/lib/store';
import { addressSchema } from '@/lib/schema';
import axios from 'axios';
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface JobGrowthData {
  stats: { yoy_growth: number; total_jobs: number; top_sectors: string[] };
  trends: { year: number; value: number }[];
  geo: { lat: number; lon: number; tract?: string; zip?: string; county?: string };
}

const queryClient = new QueryClient();

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <JobGrowthPage />
    </QueryClientProvider>
  );
}

function JobGrowthPage() {
  const { addresses, setAddresses, geoType, setGeoType } = useAddressStore();
  const { register, handleSubmit, formState: { errors } } = useForm<{ addresses: string; geoType: 'tract' | 'zip' | 'county' }>({
    resolver: zodResolver(addressSchema),
  });

  const onSubmit = (data: { addresses: string; geoType: 'tract' | 'zip' | 'county' }) => {
    setAddresses(data.addresses.split('\n').filter(a => a.trim()));
    // The geoType is set directly by the react-select component's onChange handler
  };

  return (
    <div className="container mx-auto p-4">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-xl mx-auto mb-8 p-6 bg-card border rounded-lg">
          <textarea {...register('addresses')} placeholder="Enter addresses, one per line..." className="w-full p-2 border rounded h-32 bg-transparent" />
          {errors.addresses && <p className="text-red-500 text-sm">{errors.addresses.message}</p>}
          <Select
            options={[{ value: 'tract', label: 'Census Tract' }, { value: 'zip', label: 'ZIP Code' }, { value: 'county', label: 'County' }]}
            onChange={(opt) => setGeoType(opt?.value as 'tract' | 'zip' | 'county' || 'tract')}
            defaultValue={{ value: 'tract', label: 'Census Tract' }}
          />
          <Button type="submit" className="w-full">Fetch Job Growth Data</Button>
        </form>
      </motion.div>
      <div className="grid gap-6 mt-4 md:grid-cols-2 lg:grid-cols-3">
        {addresses.map((address) => (
          <JobGrowthCard key={address} address={address} geoType={geoType} />
        ))}
      </div>
    </div>
  );
}

function JobGrowthCard({ address, geoType }: { address: string; geoType: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['jobGrowth', address, geoType],
    queryFn: async () => {
      const { data } = await axios.get('http://localhost:8000/api/job-growth', { params: { address, geo_type: geoType } });
      return data as JobGrowthData;
    },
    retry: false,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (error) return (
    <Alert variant="destructive">
      <AlertTitle>{address}</AlertTitle>
      <AlertDescription>Failed to fetch data: {error.message}</AlertDescription>
    </Alert>
  );

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
      <Card>
        <CardHeader><CardTitle>{address}</CardTitle></CardHeader>
        <CardContent>
          <p>YoY Growth: <strong>{data?.stats.yoy_growth}%</strong></p>
          <p>Total Jobs: <strong>{data?.stats.total_jobs.toLocaleString()}</strong></p>
          <p>Top Sectors: <strong>{data?.stats.top_sectors.join(', ')}</strong></p>
          {/* Add Recharts, Leaflet here */}
        </CardContent>
      </Card>
    </motion.div>
  );
}
