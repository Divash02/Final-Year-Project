import React from "react";

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  className?: string;
  scrollable?: boolean;
  maxHeight?: string;
}

export const Table: React.FC<TableProps> = ({
  className = "",
  children,
  scrollable = true,
  maxHeight,
  ...props
}) => {
  const tableElement = (
    <table className={["cos-table", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </table>
  );

  if (scrollable) {
    return (
      <div
        className="relative w-full overflow-x-auto"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {tableElement}
      </div>
    );
  }

  return tableElement;
};

export default Table;
