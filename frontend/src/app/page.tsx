"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
	useQuery,
	QueryClient,
	QueryClientProvider,
	useQueryClient,
} from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Select from "react-select";
import { motion } from "framer-motion";
import { useAddressStore } from "@/lib/store";
import { addressSchema } from "@/lib/schema";
import axios from "axios";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	CartesianGrid,
} from "recharts";
import { Checkbox } from "@/components/ui/checkbox";
import { CardDescription } from "@/components/ui/card";

interface JobGrowthData {
	stats: { yoy_growth: number; total_jobs: number; top_sectors: string[] };
	trends: { year: number; value: number }[];
	geo: {
		lat: number;
		lon: number;
		state_fips: string;
		county_fips: string;
		tract_code: string;
		error?: string;
	};
}

const queryClient = new QueryClient();

export default function Home() {
	return (
		<QueryClientProvider client={queryClient}>
			<JobGrowthPage />
		</QueryClientProvider>
	);
}

const Map = dynamic(() => import("@/components/Map"), {
	ssr: false,
	loading: () => <Skeleton className="h-[200px] w-full" />,
});

function JobGrowthPage() {
	const [flushCache, setFlushCache] = useState(false);
	const { addresses, setAddresses, geoType, setGeoType } = useAddressStore();
	const methods = useForm<{
		addresses: string;
		geoType: "tract" | "zip" | "county";
	}>({
		resolver: zodResolver(addressSchema),
		defaultValues: { geoType: "tract" },
	});

	const onSubmit = (data: {
		addresses: string;
		geoType: "tract" | "zip" | "county";
	}) => {
		setAddresses(data.addresses.split("\n").filter((a) => a.trim()));
	};

	return (
		<FormProvider {...methods}>
			<div className="container mx-auto p-4">
				<motion.div
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
				>
					<form
						onSubmit={methods.handleSubmit(onSubmit)}
						className="space-y-4 max-w-xl mx-auto mb-8 p-6 bg-card border rounded-lg"
					>
						<textarea
							{...methods.register("addresses")}
							placeholder="Enter addresses, one per line..."
							className="w-full p-2 border rounded h-32 bg-transparent"
						/>
						{methods.formState.errors.addresses && (
							<p className="text-red-500 text-sm">
								{methods.formState.errors.addresses.message}
							</p>
						)}
						<Select
							options={[
								{ value: "tract", label: "Census Tract" },
								{ value: "zip", label: "ZIP Code" },
								{ value: "county", label: "County" },
							]}
							onChange={(opt) =>
								methods.setValue(
									"geoType",
									(opt?.value as
										| "tract"
										| "zip"
										| "county") || "tract"
								)
							}
							defaultValue={{
								value: "tract",
								label: "Census Tract",
							}}
						/>
						<div className="flex items-center space-x-2">
							<Checkbox
								id="flush-cache"
								checked={flushCache}
								onCheckedChange={(checked) =>
									setFlushCache(Boolean(checked))
								}
							/>
							<label
								htmlFor="flush-cache"
								className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
							>
								Force Refresh (Flush Cache)
							</label>
						</div>
						<Button type="submit" className="w-full">
							Fetch Job Growth Data
						</Button>
					</form>
				</motion.div>
				<div className="grid gap-6 mt-4 md:grid-cols-2 lg:grid-cols-3">
					{addresses.map((address) => (
						<JobGrowthCard
							key={address}
							address={address}
							geoType={geoType}
							flushCache={flushCache}
						/>
					))}
				</div>
			</div>
		</FormProvider>
	);
}

function JobGrowthCard({
	address,
	geoType,
	flushCache,
}: {
	address: string;
	geoType: string;
	flushCache: boolean;
}) {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useQuery({
		queryKey: ["jobGrowth", address, geoType, flushCache],
		queryFn: async () => {
			const params: any = { address, geo_type: geoType };
			if (flushCache) {
				params.flush_cache = true;
			}
			const { data } = await axios.get(
				"http://localhost:8000/api/job-growth",
				{ params }
			);
			return data as JobGrowthData;
		},
		onSuccess: (freshData) => {
			// If this was a successful "force refresh", we need to update
			// the regular (non-flushed) query cache with the fresh data.
			if (flushCache) {
				queryClient.setQueryData(
					["jobGrowth", address, geoType, false],
					freshData
				);
			}
		},
		retry: false,
	});

	if (isLoading) return <Skeleton className="h-48 w-full" />;

	if (error) {
		const errorMessage =
			axios.isAxiosError(error) && error.response
				? `${error.response.status}: ${error.response.data.detail}`
				: error.message;
		return (
			<Alert variant="destructive">
				<AlertTitle>{address}</AlertTitle>
				<AlertDescription>
					Failed to fetch data: {errorMessage}
				</AlertDescription>
			</Alert>
		);
	}

	if (!data) return null;

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.3 }}
		>
			<Card>
				<CardHeader>
					<CardTitle>{address}</CardTitle>
					<CardDescription>
						County FIPS: {data.geo.county_fips} | Tract:{" "}
						{data.geo.tract_code}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{data.geo.error && (
						<Alert variant="destructive" className="mb-4">
							<AlertDescription>
								{data.geo.error}
							</AlertDescription>
						</Alert>
					)}
					<div className="grid grid-cols-2 gap-4 mb-4">
						<div>
							<p className="text-sm text-muted-foreground">
								YoY Growth
							</p>
							<p className="text-2xl font-bold">
								{data.stats.yoy_growth}%
							</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">
								Total Jobs
							</p>
							<p className="text-2xl font-bold">
								{data.stats.total_jobs.toLocaleString()}
							</p>
						</div>
					</div>
					<p className="text-sm text-muted-foreground mb-2">
						Top Sectors:{" "}
						<strong>{data.stats.top_sectors.join(", ")}</strong>
					</p>
					<h4 className="font-semibold my-2">Employment Trends</h4>
					<ResponsiveContainer width="100%" height={200}>
						<LineChart
							data={data.trends}
							margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
						>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="year" />
							<YAxis />
							<Tooltip />
							<Line
								type="monotone"
								dataKey="value"
								stroke="#8884d8"
							/>
						</LineChart>
					</ResponsiveContainer>
					<h4 className="font-semibold my-2 mt-4">Market Area</h4>
					<Map lat={data.geo.lat} lon={data.geo.lon} />
				</CardContent>
			</Card>
		</motion.div>
	);
}
