import "./globals.css"

export const metadata = {
  title: "ApexSales AI",
  description: "Sales AI MVP"
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-950 text-slate-50">
        {children}
      </body>
    </html>
  )
}
