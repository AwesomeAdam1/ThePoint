import NFLSchedule from './components/NFLSchedule';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <main className="container mx-auto py-8">
        <NFLSchedule year={2025} />
      </main>
    </div>
  );
}
