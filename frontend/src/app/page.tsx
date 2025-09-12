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
import { Badge } from "@/components/ui/badge";
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

interface Growth {
	"6mo"?: number;
	"1y"?: number;
	"2y"?: number;
	"5y"?: number;
}

interface Sector {
	name: string;
	growth: number;
}

interface DataPayload {
	source: string;
	total_jobs: number;
	unemployment_rate?: number;
	labor_force?: number;
	growth: Growth;
	top_sectors_growing: Sector[];
	trends: { year: number; value: number }[];
	error?: string;
}

interface JobGrowthData {
	geo: { lat: number; lon: number };
	county_context?: DataPayload;
	granular_data?: DataPayload;
	notes: string[];
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

// Dynamically import react-select to prevent SSR hydration errors
const ClientOnlySelect = dynamic(() => import("react-select"), { ssr: false });

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
						<ClientOnlySelect
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

	const { granular_data, county_context, notes = [] } = data;
	const hasGranularData = granular_data && !granular_data.error;
	const hasCountyData = county_context && !county_context.error;

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.3 }}
		>
			<Card>
				<CardHeader>
					<CardTitle>{address}</CardTitle>
					<CardDescription>{geoType.toUpperCase()}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-6">
						{hasGranularData && (
							<DataDisplay
								data={granular_data}
								title={`${
									geoType.charAt(0).toUpperCase() +
									geoType.slice(1)
								} Level Data`}
							/>
						)}
						{granular_data?.error && (
							<Alert variant="destructive">
								<AlertDescription>
									{granular_data.error}
								</AlertDescription>
							</Alert>
						)}

						{hasCountyData && (
							<DataDisplay
								data={county_context}
								title="County Level Context"
							/>
						)}
						{county_context?.error && (
							<Alert variant="destructive">
								<AlertDescription>
									{county_context.error}
								</AlertDescription>
							</Alert>
						)}

						<div>
							<h4 className="font-semibold my-2 mt-4">
								Market Area
							</h4>
							<Map lat={data.geo.lat} lon={data.geo.lon} />
						</div>

						{notes.length > 0 && (
							<div className="text-xs text-muted-foreground space-y-1 pt-4 border-t">
								{notes.map((note, i) => (
									<p key={i}>* {note}</p>
								))}
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</motion.div>
	);
}

function DataDisplay({ data, title }: { data: DataPayload; title: string }) {
	const growthPeriods = ["6mo", "1y", "2y", "5y"] as const;
	const growth = data.growth || {};
	const growthData = growthPeriods
		.map((p) => ({ period: p, value: growth[p] }))
		.filter((d) => d.value != null);

	return (
		<div className="p-4 border rounded-lg">
			<h3 className="font-semibold text-lg mb-1">{title}</h3>
			<p className="text-xs text-muted-foreground mb-3">{data.source}</p>

			<div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 text-sm">
				<div className="font-medium">Total Jobs:</div>
				<div>{(data.total_jobs ?? 0).toLocaleString()}</div>
				<div className="font-medium">Unemployment:</div>
				<div>{data.unemployment_rate?.toFixed(1)}%</div>
				<div className="font-medium">Labor Force:</div>
				<div>{(data.labor_force ?? 0).toLocaleString()}</div>
			</div>

			{data.top_sectors_growing && data.top_sectors_growing.length > 0 && (
				<div>
					<p className="text-sm text-muted-foreground mb-2">
						Top Growing Sectors (YoY):
					</p>
					<div className="flex flex-wrap gap-1 mb-4">
						{data.top_sectors_growing.map((sector) => (
							<Badge
								key={sector.name}
								variant={
									sector.growth > 0
										? "default"
										: "secondary"
								}
							>
								{sector.name}: {sector.growth}%
							</Badge>
						))}
					</div>
				</div>
			)}

			{data.trends && data.trends.length > 0 && (
				<div>
					<h4 className="font-semibold my-2">Employment Trend</h4>
					<ResponsiveContainer width="100%" height={200}>
						<LineChart
							data={data.trends}
							margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
						>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="year" />
							<YAxis
								tickFormatter={(value) =>
									new Intl.NumberFormat("en-US", {
										notation: "compact",
										compactDisplay: "short",
									}).format(value as number)
								}
							/>
							<Tooltip
								formatter={(value) =>
									(value as number).toLocaleString()
								}
							/>
							<Line
								type="monotone"
								dataKey="value"
								stroke="#8884d8"
								strokeWidth={2}
							/>
						</LineChart>
					</ResponsiveContainer>
				</div>
			)}
		</div>
	);
}
