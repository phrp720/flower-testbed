import React from "react";

type Props = {
    title: string;
    subtitle?: string;
    children?: React.ReactNode;
};

export function FileCard({ title, subtitle, children }: Props) {
    return (
        <section className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                    {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
                </div>
            </div>

            <div>{children}</div>
        </section>
    );
}
