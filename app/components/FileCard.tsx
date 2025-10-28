import React from "react";

type Props = {
    title: string;
    subtitle?: string;
    children?: React.ReactNode;
    className?: string;
};

export function FileCard({ title, subtitle, children, className }: Props) {
    return (
        <section
            className={`rounded-md border bg-white p-3 shadow-sm text-sm ${className ?? ""}`}
            style={{ maxWidth: 360 }}
        >
            <div className="mb-2 flex items-start justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-gray-800" align={"start"}>{title}</h3>
                    {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
                </div>
            </div>

            <div>{children}</div>
        </section>
    );
}