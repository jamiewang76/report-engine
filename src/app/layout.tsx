export const metadata = { title: "MeasureSquare Report Engine" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f7f7f8", color: "#1a1a1a" }}>
        {children}
      </body>
    </html>
  );
}
