import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "../lib/format";

export const chartColors = {
  green: "#249f72",
  lime: "#b6e85f",
  amber: "#f1b84b",
  blue: "#5d8ee8",
  purple: "#9272d6",
  rose: "#df7e91",
  teal: "#31b4a3",
  slate: "#dce5e1",
};

const tooltipStyle = {
  border: "1px solid #e2e9e5",
  borderRadius: 12,
  boxShadow: "0 10px 30px rgba(18, 40, 32, 0.09)",
  fontSize: 12,
  padding: "10px 12px",
  background: "#ffffff",
};

export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card chart-card ${className}`.trim()}>
      <div className="card-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ChartLegend({
  items,
}: {
  items: Array<{ label: string; value?: string | number; color: string }>;
}) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.label} className="chart-legend-item">
          <i style={{ background: item.color }} />
          <span>{item.label}</span>
          {item.value !== undefined && <strong>{item.value}</strong>}
        </span>
      ))}
    </div>
  );
}

export function DonutChart({
  data,
  centerLabel,
  centerValue,
  height = 220,
}: {
  data: Array<{ name: string; value: number; color: string }>;
  centerLabel?: string;
  centerValue?: string | number;
  height?: number;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="donut-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="65%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          {total === 0 && (
            <Pie
              data={[{ name: "Empty", value: 1 }]}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="92%"
              fill="#edf2ef"
              stroke="none"
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <strong>{centerValue ?? total}</strong>
        <span>{centerLabel ?? "Total"}</span>
      </div>
    </div>
  );
}

export function PayrollAreaChart({
  data,
  height = 235,
}: {
  data: Array<{ month: string; total_net: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="payrollFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColors.green} stopOpacity={0.28} />
            <stop offset="100%" stopColor={chartColors.green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8eeeb" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#82928c" }}
          tickFormatter={(value: string) => value.split("-")[0]?.slice(0, 3)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#82928c" }}
          tickFormatter={(value: number) => formatCurrency(value, true)}
          width={58}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number) => [formatCurrency(value), "Net payroll"]}
        />
        <Area
          type="monotone"
          dataKey="total_net"
          stroke={chartColors.green}
          strokeWidth={2.5}
          fill="url(#payrollFill)"
          dot={{ r: 3, fill: "#ffffff", strokeWidth: 2 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DepartmentBarChart({
  data,
  height = 235,
}: {
  data: Array<{ department: string; count: number }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 18, left: 6, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 5" horizontal={false} stroke="#e8eeeb" />
        <XAxis
          type="number"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#82928c" }}
        />
        <YAxis
          type="category"
          dataKey="department"
          tickLine={false}
          axisLine={false}
          width={105}
          tick={{ fontSize: 11, fill: "#516660" }}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f4f8f5" }} />
        <Bar dataKey="count" radius={[0, 8, 8, 0]} fill={chartColors.green} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function UserRoleChart({
  data,
  height = 250,
}: {
  data: Array<{ name: string; value: number; color: string }>;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={88} stroke="none">
          {data.map((item) => (
            <Cell key={item.name} fill={item.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "#516660" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
