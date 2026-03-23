import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading = false, 
  className = '', 
  disabled,
  ...props 
}) => {
  const variants = {
    primary: "bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20",
    secondary: "bg-secondary text-white hover:bg-emerald-600 shadow-lg shadow-emerald-200",
    outline: "border-2 border-slate-200 text-slate-700 hover:border-primary hover:text-primary bg-white",
    danger: "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-200"
  };

  return (
    <button 
      className={cn(
        "w-full py-3 px-4 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all duration-200 active:scale-95 flex items-center justify-center gap-2",
        variants[variant],
        (disabled || isLoading) && "opacity-50 cursor-not-allowed active:scale-100",
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Thinking...
        </>
      ) : children}
    </button>
  );
};
