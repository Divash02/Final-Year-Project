import React from "react";

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  children,
  className = "",
}) => {
  return (
    <section className={`space-y-4 ${className}`}>
      <header>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        )}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
};

export default FormSection;
