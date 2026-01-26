"use client";

import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Info, X } from 'lucide-react';

type DialogProps = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    type?: 'info' | 'error' | 'success' | 'warning' | 'confirm';
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
};

export default function Dialog({
    isOpen,
    onClose,
    title,
    message,
    type = 'info',
    onConfirm,
    confirmText = 'OK',
    cancelText = 'Cancel',
}: DialogProps) {
    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'error':
                return (
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                        <X className="h-6 w-6 text-red-600" strokeWidth={2} />
                    </div>
                );
            case 'success':
                return (
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                        <CheckCircle2 className="h-6 w-6 text-green-600" strokeWidth={1.5} />
                    </div>
                );
            case 'warning':
                return (
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                        <AlertTriangle className="h-6 w-6 text-yellow-600" strokeWidth={1.5} />
                    </div>
                );
            case 'confirm':
                return (
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                        <HelpCircle className="h-6 w-6 text-gray-600" strokeWidth={1.5} />
                    </div>
                );
            default:
                return (
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                        <Info className="h-6 w-6 text-gray-600" strokeWidth={1.5} />
                    </div>
                );
        }
    };

    const handleConfirm = () => {
        if (onConfirm) {
            onConfirm();
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9999] overflow-y-auto" onClick={onClose}>
            {/* Backdrop with fade animation */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ease-in-out"
                style={{ animation: 'fadeIn 0.2s ease-out' }}
            />

            {/* Modal Container */}
            <div className="fixed inset-0 flex items-center justify-center p-4">
                <div
                    className="relative transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all duration-300 ease-out w-full max-w-md"
                    style={{ animation: 'scaleIn 0.2s ease-out' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="bg-white px-6 pb-4 pt-5">
                        <div className="flex items-start gap-4">
                            {getIcon()}
                            <div className="flex-1 mt-0">
                                <h3 className="text-xl font-semibold leading-6 text-gray-900 mb-2">
                                    {title}
                                </h3>
                                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                                    {message}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3 border-t border-gray-200">
                        {type === 'confirm' ? (
                            <>
                                <button
                                    type="button"
                                    onClick={handleConfirm}
                                    className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                >
                                    {confirmText}
                                </button>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                                >
                                    {cancelText}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-semibold text-white bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                            >
                                {confirmText}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}