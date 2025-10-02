import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

type Role = 'admin' | 'user'
type TDesafio = { id: string; numero: number; nome: string; descricao: string | null; pontuacao_max: number }
type TPessoa = { id: string; inscricao: number; nome: string }
type TPontuacao = { pessoa_id: string; desafio_id: string; score: number }

/* utils */
function norm(s: string) { return (s ?? '').trim().toLowerCase() }
function nameExists<T extends { nome: string }>(arr: T[], nome: string) {
  const n = norm(nome); return arr.some(a => norm(a.nome) === n)
}
function nextSequential<T>(arr: T[], field: keyof T, start = 1) {
  const nums = arr.map((it: any) => Number(it?.[field]) || 0).filter(n => n > 0)
  return nums.length ? Math.max(...nums) + 1 : start
}
function withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('Timeout na chamada ao Supabase.')), ms)),
  ]) as Promise<T>;
}

export default function App() {
  const [tab, setTab] = useState<'desafios'|'pessoas'|'rankingDesafio'|'rankingGeral'|'tabelaGeral'|'config'>('desafios')
  const [authed, setAuthed] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('user')

  const [login, setLogin] = useState({ email: '', pass: '' })
  const [loginErr, setLoginErr] = useState('')

  const [desafios, setDesafios] = useState<TDesafio[]>([])
  const [pessoas, setPessoas] = useState<TPessoa[]>([])
  const [pontuacoes, setPontuacoes] = useState<TPontuacao[]>([])

  const [novoDesafio, setNovoDesafio] = useState({ nome: '', descricao: '', pontuacaoMax: 100 })
  const [novaPessoa, setNovaPessoa] = useState({ nome: '' })
  const [erroDesafio, setErroDesafio] = useState('')
  const [erroPessoa, setErroPessoa] = useState('')

  const [desafioSelecionado, setDesafioSelecionado] = useState<string>('')

  /* feedback visual */
  const [savingDesafio, setSavingDesafio] = useState(false)
  const [savingPessoa, setSavingPessoa] = useState(false)

  /* debug/erros de API */
  const [lastApiError, setLastApiError] = useState<string>('')  // mostrado abaixo dos botões
  const [lastApiDebug, setLastApiDebug] = useState<any>(null)   // visível em Configurações

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user
      if (u) {
        setAuthed(true); setEmail(u.email || '')
        await loadRole(u.id)
        await loadAll()
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, sess) => {
      const u = sess?.user
      if (u) {
        setAuthed(true); setEmail(u.email || '')
        await loadRole(u.id)
        await loadAll()
      } else {
        setAuthed(false); setEmail(''); setRole('user')
        setDesafios([]); setPessoas([]); setPontuacoes([])
      }
    })
    return () => { sub.subscription.unsubscribe() }
  }, [])

  async function loadRole(userId: string) {
    const { data } = await supabase.from('app_roles').select('role').eq('user_id', userId).single()
    setRole((data?.role as Role) ?? 'user')
  }

  async function tryLogin(e?: React.FormEvent) {
    e?.preventDefault?.()
    setLoginErr('')
    const { data, error } = await supabase.auth.signInWithPassword({ email: login.email, password: login.pass })
    if (error) { setLoginErr(error.message); return }
    setAuthed(!!data.session)
  }
  async function doLogout() { await supabase.auth.signOut() }

  async function loadAll() {
    const [d1, d2, d3] = await Promise.all([
      supabase.from('desafios').select('id, numero, nome, descricao, pontuacao_max').order('numero'),
      supabase.from('pessoas').select('id, inscricao, nome').order('inscricao'),
      supabase.from('pontuacoes').select('pessoa_id, desafio_id, score'),
    ])
    setDesafios((d1.data || []) as any)
    setPessoas((d2.data || []) as any)
    setPontuacoes((d3.data || []) as any)

    if (!desafioSelecionado && (d1.data || []).length) {
      setDesafioSelecionado((d1.data as any)[0].id)
    }
  }

  const mapPont = useMemo(() => {
    const m = new Map<string, Map<string, number>>()
    pessoas.forEach(p => m.set(p.id, new Map()))
    pontuacoes.forEach(r => {
      const mp = m.get(r.pessoa_id) || new Map()
      mp.set(r.desafio_id, r.score || 0)
      m.set(r.pessoa_id, mp)
    })
    return m
  }, [pessoas, pontuacoes])

  const pessoasComScores = useMemo(
    () => pessoas.map(p => ({ id: p.id, nome: p.nome, pontuacoes: mapPont.get(p.id) || new Map() })),
    [pessoas, mapPont]
  )

  const rankingPorDesafio = useMemo(() => {
    const obj: Record<string, {lista: Array<{pessoa:string; score:number}>}> = {}
    desafios.forEach(d => {
      const lista = pessoasComScores
        .map(p => ({ pessoa: p.nome, score: p.pontuacoes.get(d.id) || 0 }))
        .sort((a,b) => b.score - a.score)
      obj[d.id] = { lista }
    })
    return obj
  }, [desafios, pessoasComScores])

  const rankingGeral = useMemo(() => {
    return pessoasComScores.map(p => {
      const total = desafios.reduce((acc, d) => acc + (p.pontuacoes.get(d.id) || 0), 0)
      const max = desafios.reduce((acc, d) => acc + (d.pontuacao_max || 0), 0)
      return { pessoa: p.nome, total, max }
    }).sort((a,b) => b.total - a.total || a.pessoa.localeCompare(b.pessoa))
  }, [desafios, pessoasComScores])

  const tabelaGeral = useMemo(() => {
    return pessoasComScores.map(p => {
      const porDesafio = desafios.map(d => ({ desafioId: d.id, score: p.pontuacoes.get(d.id) || 0, max: d.pontuacao_max }))
      const total = porDesafio.reduce((acc, c) => acc + c.score, 0)
      return { id: p.id, pessoa: p.nome, porDesafio, total }
    }).sort((a,b) => b.total - a.total || a.pessoa.localeCompare(b.pessoa))
  }, [desafios, pessoasComScores])

  /* === criar/remover DESAFIO === */
  async function criarDesafio() {
    setErroDesafio(''); setLastApiError(''); setLastApiDebug(null)

    // validações ANTES do saving
    const nome = (novoDesafio.nome || '').trim()
    if (!nome) { setErroDesafio('Informe o nome do desafio.'); return }
    if (nameExists(desafios as any, nome)) { setErroDesafio('Já existe um desafio com esse nome.'); return }

    setSavingDesafio(true)
    try {
      const numero = nextSequential(desafios as any, 'numero' as any, 1)

      const resp = await withTimeout(
        supabase.from('desafios')
          .insert([{ numero, nome, descricao: (novoDesafio.descricao||'').trim(), pontuacao_max: Number(novoDesafio.pontuacaoMax)||0 }])
          .select('*'),
        12000
      )

      setLastApiDebug({ op: 'insert:desafios', resp })
      // @ts-ignore
      if (resp?.error) throw resp.error

      await loadAll()
      setNovoDesafio({ nome: '', descricao: '', pontuacaoMax: 100 })
    } catch (err: any) {
      console.error('[criarDesafio] err:', err)
      setLastApiError(err?.message || 'Falha ao salvar o desafio.')
      setErroDesafio(err?.message || 'Falha ao salvar o desafio.')
    } finally {
      setSavingDesafio(false)
    }
  }

  function removerDesafio(id: string) {
    const d = desafios.find(x => x.id === id)
    if (!confirm(`Excluir o desafio "${d?.nome}"? Isso removerá apenas as pontuações desse desafio (as pessoas serão mantidas).`)) {
      return
    }
    supabase.from('pontuacoes').delete().eq('desafio_id', id)
      .then(() => supabase.from('desafios').delete().eq('id', id))
      .then(() => loadAll())
      .catch(err => {
        console.error(err)
        alert('Falha ao excluir desafio. Veja o console para detalhes.')
      })
  }

  /* === criar/remover PESSOA === */
  async function criarPessoa() {
    setErroPessoa(''); setLastApiError(''); setLastApiDebug(null)

    const nome = (novaPessoa.nome || '').trim()
    if (!nome) { setErroPessoa('Informe o nome da pessoa.'); return }
    if (nameExists(pessoas as any, nome)) { setErroPessoa('Já existe uma pessoa com esse nome.'); return }

    setSavingPessoa(true)
    try {
      const inscricao = nextSequential(pessoas as any, 'inscricao' as any, 1)

      const resp = await withTimeout(
        supabase.from('pessoas').insert([{ inscricao, nome }]).select('*'),
        12000
      )

      setLastApiDebug({ op: 'insert:pessoas', resp })
      // @ts-ignore
      if (resp?.error) throw resp.error

      await loadAll()
      setNovaPessoa({ nome: '' })
    } catch (err: any) {
      console.error('[criarPessoa] err:', err)
      setLastApiError(err?.message || 'Falha ao salvar a pessoa.')
      setErroPessoa(err?.message || 'Falha ao salvar a pessoa.')
    } finally {
      setSavingPessoa(false)
    }
  }

  function removerPessoa(id: string) {
    const p = pessoas.find(x => x.id === id)
    if (confirm(`Excluir a pessoa "${p?.
