import React from "react";

export interface TableColumn<T = any> {
  key: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  className?: string;
  scrollable?: boolean;
  maxHeight?: string;
  columns?: TableColumn<any>[];
  data?: any[];
  emptyMessage?: string;
  loading?: boolean;
}

export const Table: React.FC<TableProps> = ({
  className = "",
  children,
  scrollable = true,
  maxHeight,
  columns,
  data,
  emptyMessage,
  loading,
  ...props
}) => {
  const hasColumns = Array.isArray(columns);

  const tableElement = (
    <table className={["cos-table", className].filter(Boolean).join(" ")} {...props}>
      {hasColumns ? (
        <>
          <thead>
            <tr>
              {columns!.map((c) => (
                <th key={c.key} className={c.className}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns!.length} className="text-center py-4">Loading…</td></tr>
            ) : !data || data.length === 0 ? (
              <tr><td colSpan={columns!.length} className="text-center py-4">{emptyMessage || "No data"}</td></tr>
            ) : (
              data.map((row, i) => (
                <tr key={row?._id ?? i}>
                  {columns!.map((c) => (
                    <td key={c.key} className={c.className}>
                      {c.render ? c.render(row) : row?.[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </>
      ) : (
        children
      )}
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
