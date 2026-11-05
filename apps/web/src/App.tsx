import { useState } from 'react';
import { getHealth } from './lib/api';
export function App() {
  const [status, setStatus] = useState('A conexão com a API ainda não foi verificada.');
  const [loading, setLoading] = useState(false);
  async function checkApi() {
    setLoading(true);
    setStatus('Verificando conexão…');
    try {
      await getHealth();
      setStatus('API disponível. Conexão estabelecida.');
    } catch {
      setStatus('API indisponível. Confira se o servidor está iniciado e tente novamente.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <p className="mb-4 text-sm font-semibold tracking-widest text-primary">SELLEROS</p>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Uma base para organizar sua operação.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
        Gestão operacional e financeira para vendedores de marketplaces. Estamos construindo a
        fundação da plataforma.
      </p>
      <section
        aria-labelledby="environment-title"
        className="mt-10 rounded-xl border border-gray-200 bg-white p-6"
      >
        <h2 id="environment-title" className="text-lg font-semibold">
          Ambiente de desenvolvimento
        </h2>
        <p className="mt-2 text-muted">
          Etapa 01 · Fundação técnica. Funcionalidades de negócio estarão disponíveis nas próximas
          etapas.
        </p>
        <button
          type="button"
          onClick={() => void checkApi()}
          disabled={loading}
          className="mt-6 rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-60"
        >
          {loading ? 'Verificando…' : 'Verificar conexão com a API'}
        </button>
        <p role="status" aria-live="polite" className="mt-4 text-sm text-muted">
          {status}
        </p>
      </section>
      <footer className="mt-8 text-sm text-muted">SellerOS · Ambiente local</footer>
    </main>
  );
}
