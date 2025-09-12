"use client";

import dynamic from "next/dynamic";
import React, { Fragment, useState } from "react";
import { useForm, FormProvider, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
	useQuery,
	QueryClient,
	QueryClientProvider,
	useQueryClient,
} from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { useAddressStore } from "@/lib/store";
import { addressSchema } from "@/lib/schema";
import axios from "axios";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	Legend,
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
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";

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
	trends: { year: number; value: number; projected?: boolean }[];
	monthly_employment_trends?: { year: string; month: string; value: number; label: string }[];
	error?: string;
}

interface JobGrowthData {
	geo: { lat: number; lon: number };
	county_context?: DataPayload;
	granular_data?: DataPayload;
	notes: string[];
}

type AddressFormData = z.infer<typeof addressSchema>;

const queryClient = new QueryClient();

export default function ExplorePage() {
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

function AddressForm() {
	const [flushCache, setFlushCache] = useState(false);
	const { setAddresses, setGeoType } = useAddressStore();

	const methods = useForm<AddressFormData>({
		resolver: zodResolver(addressSchema),
		defaultValues: {
			addresses: [{ value: "" }],
			geoType: "tract",
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: methods.control,
		name: "addresses",
	});

	const onSubmit = (data: AddressFormData) => {
		const addressValues = data.addresses
			.map((a) => a.value)
			.filter((a) => a.trim());
		setAddresses(addressValues);
		setGeoType(data.geoType);
	};

	return (
		<FormProvider {...methods}>
			<motion.form
				initial={{ opacity: 0, x: 20 }}
				animate={{ opacity: 1, x: 0 }}
				transition={{ duration: 0.5 }}
				onSubmit={methods.handleSubmit(onSubmit)}
				className="space-y-6"
			>
				<div>
					<label className="block text-sm font-medium mb-2">
						Addresses
					</label>
					<div className="space-y-2">
						{fields.map((field, index) => (
							<div
								key={field.id}
								className="flex items-center gap-2"
							>
								<Input
									{...methods.register(
										`addresses.${index}.value`
									)}
									placeholder={`Address ${index + 1}`}
									className="flex-grow"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => remove(index)}
									disabled={fields.length <= 1}
								>
									<X className="size-4" />
								</Button>
							</div>
						))}
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="mt-2"
						onClick={() => append({ value: "" })}
					>
						<Plus className="mr-2 size-4" />
						Add Address
					</Button>
					{methods.formState.errors.addresses && (
						<p className="text-red-500 text-sm mt-1">
							{methods.formState.errors.addresses.message ||
								methods.formState.errors.addresses.root
									?.message}
						</p>
					)}
				</div>

				<div>
					<label className="block text-sm font-medium mb-2">
						Geography Level
					</label>
					<ClientOnlySelect
						options={[
							{ value: "tract", label: "Census Tract" },
							{ value: "zip", label: "ZIP Code" },
							{ value: "county", label: "County" },
						]}
						onChange={(opt) => {
							const geoTypeValue =
								(opt?.value as "tract" | "zip" | "county") ||
								"tract";
							methods.setValue("geoType", geoTypeValue);
							setGeoType(geoTypeValue);
						}}
						defaultValue={{
							value: "tract",
							label: "Census Tract",
						}}
					/>
				</div>

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
			</motion.form>
		</FormProvider>
	);
}

function JobGrowthPage() {
	const { addresses, geoType } = useAddressStore();
	const [flushCache] = useState(false); // This state is now managed inside AddressForm

	return (
		<div className="flex h-screen">
			<div className="flex-1 p-6 overflow-y-auto">
				<AnimatePresence>
					<div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
						{addresses.map((address) => (
							<JobGrowthCard
								key={address}
								address={address}
								geoType={geoType}
								flushCache={flushCache}
							/>
						))}
					</div>
				</AnimatePresence>
			</div>
			<aside className="w-96 p-6 bg-sidebar border-l border-sidebar-border overflow-y-auto">
				<div className="sticky top-0">
					<h2 className="text-xl font-semibold mb-4">
						Market Search
					</h2>
					<AddressForm />
				</div>
			</aside>
		</div>
	);
}

function JobGrowthCard({
	address,
	geoType,
	flushCache,
}: {
	address: string;
	geoType: "tract" | "zip" | "county";
	flushCache: boolean;
}) {
	const [isModalOpen, setIsModalOpen] = useState(false);
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

	const mainData = hasGranularData ? granular_data : county_context;

	return (
		<>
			<motion.div
				initial={{ scale: 0.95 }}
				animate={{ scale: 1 }}
				exit={{ scale: 0.95 }}
			>
				<Card
					onClick={() => setIsModalOpen(true)}
					className="cursor-pointer hover:shadow-lg transition-shadow"
				>
					<CardHeader>
						<CardTitle>{address}</CardTitle>
						<CardDescription>
							{geoType.toUpperCase()}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{mainData && (
							<div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
								<div className="font-medium">Total Jobs:</div>
								<div>
									{(
										mainData.total_jobs ?? 0
									).toLocaleString()}
								</div>
								<div className="font-medium">Unemployment:</div>
								<div>
									{mainData.unemployment_rate?.toFixed(1)}%
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</motion.div>
			<Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
				<JobGrowthModalContent data={data} geoType={geoType} />
			</Modal>
		</>
	);
}

function DataDisplay({ data, title }: { data: DataPayload; title: string }) {
	const yearlyChartData = React.useMemo(() => {
		if (!data.trends || data.trends.length === 0) return [];

		const latestYear = Math.max(...data.trends.map((t) => t.year));
		const fiveYearsAgo = latestYear - 4;
		const filteredTrends = data.trends.filter(
			(t) => t.year >= fiveYearsAgo
		);

		const sortedTrends = [...filteredTrends].reverse(); // chart needs ascending years
		const lastActualPointIndex = sortedTrends.findLastIndex(
			(p) => !p.projected
		);

		return sortedTrends.map((d, i) => {
			const point: any = {
				year: d.year,
				value: d.value,
				actual: null,
				projected: null,
			};
			if (d.projected) {
				point.projected = d.value;
			} else {
				point.actual = d.value;
			}
			if (
				i === lastActualPointIndex &&
				lastActualPointIndex < sortedTrends.length - 1
			) {
				point.projected = d.value;
			}
			return point;
		});
	}, [data.trends]);

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

			{data.top_sectors_growing &&
				data.top_sectors_growing.length > 0 && (
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

			{data.monthly_employment_trends &&
			data.monthly_employment_trends.length > 0 ? (
				<div>
					<h4 className="font-semibold my-2">
						County Employment Trend (Monthly)
					</h4>
					<ResponsiveContainer width="100%" height={200}>
						<LineChart
							data={data.monthly_employment_trends}
							margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
						>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="label" interval={5} />
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
							<Legend />
							<Line
								name="Employment"
								type="monotone"
								dataKey="value"
								stroke="#8884d8"
								strokeWidth={2}
								dot={false}
							/>
						</LineChart>
					</ResponsiveContainer>
				</div>
			) : yearlyChartData && yearlyChartData.length > 0 ? (
				<div>
					<h4 className="font-semibold my-2">Employment Trend</h4>
					<ResponsiveContainer width="100%" height={200}>
						<LineChart
							data={yearlyChartData}
							margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
						>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="year" interval={0} />
							<YAxis
								tickFormatter={(value) =>
									new Intl.NumberFormat("en-US", {
										notation: "compact",
										compactDisplay: "short",
									}).format(value as number)
								}
							/>
							<Tooltip
								formatter={(value, name, props) => [
									(
										props.payload.value as number
									).toLocaleString(),
									"Employment",
								]}
							/>
							<Legend />
							<Line
								name="Actual"
								type="monotone"
								dataKey="actual"
								stroke="#8884d8"
								strokeWidth={2}
								connectNulls={false}
							/>
							<Line
								name="Projected"
								type="monotone"
								dataKey="projected"
								stroke="#82ca9d"
								strokeWidth={2}
								strokeDasharray="5 5"
								connectNulls={false}
							/>
						</LineChart>
					</ResponsiveContainer>
				</div>
			) : null}
		</div>
	);
}
function JobGrowthModalContent({
	data,
	geoType,
}: {
	data: JobGrowthData;
	geoType: "tract" | "zip" | "county";
}) {
	const { granular_data, county_context, notes = [], geo } = data;
	const hasGranularData = granular_data && !granular_data.error;
	const hasCountyData = county_context && !county_context.error;

	return (
		<>
			<CardHeader className="pt-0 px-0">
				<CardTitle>
					{geo.lat}, {geo.lon}
				</CardTitle>
				<CardDescription>
					{geoType.toUpperCase()} Level Analysis
				</CardDescription>
			</CardHeader>
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
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

					{hasCountyData && geoType !== "county" && (
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
				</div>
				<div className="space-y-6">
					<div>
						<h4 className="font-semibold mb-2">Market Area</h4>
						<Map lat={geo.lat} lon={geo.lon} geoType={geoType} />
					</div>

					{notes.length > 0 && (
						<div className="text-xs text-muted-foreground space-y-1 pt-4 border-t">
							<h4 className="font-semibold mb-2 text-sm text-foreground">
								Notes
							</h4>
							{notes.map((note, i) => (
								<p key={i}>* {note}</p>
							))}
						</div>
					)}
				</div>
			</div>
		</>
	);
}
