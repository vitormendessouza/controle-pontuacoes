import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

type Role = 'admin' | 'user'
type TDesafio = { id: string; numero: number; nome: string; descricao: string | null; pontuacao_max: number }
type TPessoa = { id: string; inscricao: number; nome: string }
type TPontuacao = { pessoa_id: string; desafio_id: string; score: number }

function norm(s: string) { return (s ?? '').trim().toLowerCase() }
function nameExists<T extends { nome: string }>(arr: T[], nome: string) {
  const n = norm(nome); return arr.some(a => norm(a.nome) === n)
}
function nextSequential<T>(arr: T[], field: keyof T, start = 1) {
  const nums = arr.map((it: any) => Number(it?.[field]) || 0).filter(n => n > 0)
  return nums.length ? Math.max(...nums) + 1 : start
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
  async function doLogout() {
    await supabase.auth.signOut()
  }

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

  const pessoasComScores = useMemo(() => pessoas.map(p => ({ id: p.id, nome: p.nome, pontuacoes: mapPont.get(p.id) || new Map() })), [pessoas, mapPont])

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

  async function criarDesafio() {
    const nome = (novoDesafio.nome || '').trim()
    if (!nome) { setErroDesafio('Informe o nome do desafio.'); return }
    if (nameExists(desafios as any, nome)) { setErroDesafio('Já existe um desafio com esse nome.'); return }
    const numero = nextSequential(desafios as any, 'numero' as any, 1)
    const { data, error } = await supabase.from('desafios').insert([{ numero, nome, descricao: (novoDesafio.descricao||'').trim(), pontuacao_max: Number(novoDesafio.pontuacaoMax)||0 }]).select().single()
    if (error) { setErroDesafio(error.message); return }
    setDesafios(prev => [...prev, data as any]); setNovoDesafio({ nome:'', descricao:'', pontuacaoMax: 100 }); setErroDesafio('')
  }
  function removerDesafio(id: string) {
    const d = desafios.find(x => x.id === id)
    if (confirm(`Excluir o desafio "${d?.nome}"?`)) {
      supabase.from('desafios').delete().eq('id', id).then(() => loadAll())
    }
  }

  async function criarPessoa() {
    const nome = (novaPessoa.nome || '').trim()
    if (!nome) { setErroPessoa('Informe o nome da pessoa.'); return }
    if (nameExists(pessoas as any, nome)) { setErroPessoa('Já existe uma pessoa com esse nome.'); return }
    const inscricao = nextSequential(pessoas as any, 'inscricao' as any, 1)
    const { data, error } = await supabase.from('pessoas').insert([{ inscricao, nome }]).select().single()
    if (error) { setErroPessoa(error.message); return }
    setPessoas(prev => [...prev, data as any]); setNovaPessoa({ nome: '' }); setErroPessoa('')
  }
  function removerPessoa(id: string) {
    const p = pessoas.find(x => x.id === id)
    if (confirm(`Excluir a pessoa "${p?.nome}"?`)) {
      supabase.from('pessoas').delete().eq('id', id).then(() => loadAll())
    }
  }

  async function atualizarPontuacao(pessoaId: string, desafioId: string, valor: number) {
    const v = Math.max(0, Number(valor) || 0)
    const { error } = await supabase.from('pontuacoes').upsert({ pessoa_id: pessoaId, desafio_id: desafioId, score: v })
    if (!error) {
      setPontuacoes(prev => {
        const idx = prev.findIndex(r => r.pessoa_id === pessoaId && r.desafio_id === desafioId)
        if (idx >= 0) { const copy = [...prev]; copy[idx] = { pessoa_id: pessoaId, desafio_id: desafioId, score: v }; return copy }
        return [...prev, { pessoa_id: pessoaId, desafio_id: desafioId, score: v }]
      })
    }
  }

  if (!authed) {
    return (
      <div className="wrap">
        <div className="card" style={{maxWidth: 420, margin: '80px auto'}}>
          <h2 style={{marginTop:0, textAlign:'center'}}>Acessar o Sistema</h2>
          <form onSubmit={tryLogin} className="grid">
            <div>
              <label>E-mail</label>
              <input value={login.email} onChange={e=>{ setLogin({...login, email:e.target.value}); setLoginErr('') }} placeholder="voce@exemplo.com" />
            </div>
            <div>
              <label>Senha</label>
              <input type="password" value={login.pass} onChange={e=>{ setLogin({...login, pass:e.target.value}); setLoginErr('') }} placeholder="Senha" />
            </div>
            {loginErr && <div className="muted danger">{loginErr}</div>}
            <button type="submit">Entrar</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Controle de Pontuações</h1>
          <div className="muted">{new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
        </div>
        <div>
          <span className="muted" style={{marginRight: 8}}>{email} {role==='admin'?'(admin)':''}</span>
          <button className="ghost" onClick={doLogout}>Sair</button>
        </div>
      </header>

      <div className="card">
        <div className="tabs">
          <div className={`tab ${tab==='desafios'?'active':''}`} onClick={()=>setTab('desafios')}>Desafios</div>
          <div className={`tab ${tab==='pessoas'?'active':''}`} onClick={()=>setTab('pessoas')}>Pessoas</div>
          <div className={`tab ${tab==='rankingDesafio'?'active':''}`} onClick={()=>setTab('rankingDesafio')}>Ranking por Desafio</div>
          <div className={`tab ${tab==='rankingGeral'?'active':''}`} onClick={()=>setTab('rankingGeral')}>Ranking Geral</div>
          <div className={`tab ${tab==='tabelaGeral'?'active':''}`} onClick={()=>setTab('tabelaGeral')}>Tabela Geral</div>
          {role==='admin' && <div className={`tab ${tab==='config'?'active':''}`} onClick={()=>setTab('config')}>Configurações</div>}
        </div>

        {tab==='desafios' && (
          <div className="row row-2">
            <div className="card">
              <h3>Novo Desafio</h3>
              <div className="grid">
                <div className="grid grid-2">
                  <div>
                    <label>Nº do Desafio</label>
                    <input value={nextSequential(desafios as any, 'numero' as any, 1)} readOnly />
                  </div>
                  <div>
                    <label>Pontuação Máxima</label>
                    <input type="number" min={0} value={novoDesafio.pontuacaoMax}
                           onChange={e=>setNovoDesafio({...novoDesafio, pontuacaoMax: Number(e.target.value)})}/>
                  </div>
                </div>
                <div>
                  <label>Nome</label>
                  <input value={novoDesafio.nome} onChange={e=>{ setNovoDesafio({...novoDesafio, nome:e.target.value}); setErroDesafio('') }} />
                  {erroDesafio && <div className="muted danger">{erroDesafio}</div>}
                </div>
                <div>
                  <label>Descrição</label>
                  <textarea rows={3} value={novoDesafio.descricao} onChange={e=>setNovoDesafio({...novoDesafio, descricao:e.target.value})}/>
                </div>
                <button onClick={criarDesafio}>Adicionar</button>
              </div>
            </div>

            <div className="card">
              <h3>Lista de Desafios</h3>
              <table>
                <thead>
                <tr>
                  <th>Nº</th><th>Nome</th><th>Descrição</th><th className="text-right">Pontuação Máxima</th><th className="text-right">Ações</th>
                </tr>
                </thead>
                <tbody>
                {desafios.map(d=>(
                  <tr key={d.id}>
                    <td>{d.numero}</td>
                    <td>{d.nome}</td>
                    <td className="muted">{d.descricao}</td>
                    <td className="text-right">{d.pontuacao_max}</td>
                    <td className="text-right">
                      <button className="ghost" onClick={()=>removerDesafio(d.id)}>Excluir</button>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab==='pessoas' && (
          <div className="row row-2">
            <div className="card">
              <h3>Nova Pessoa</h3>
              <div className="grid">
                <div>
                  <label>Nº Inscrição</label>
                  <input value={nextSequential(pessoas as any, 'inscricao' as any, 1)} readOnly />
                </div>
                <div>
                  <label>Nome</label>
                  <input value={novaPessoa.nome} onChange={e=>{ setNovaPessoa({nome: e.target.value}); setErroPessoa('') }} />
                  {erroPessoa && <div className="muted danger">{erroPessoa}</div>}
                </div>
                <button onClick={criarPessoa}>Adicionar</button>
              </div>
            </div>

            <div className="card" style={{overflowX:'auto'}}>
              <h3>Lista de Pessoas e Pontuações</h3>
              <table>
                <thead>
                <tr>
                  <th>Nº Inscrição</th><th>Nome</th>
                  {desafios.map(d=><th key={d.id} className="text-right">{d.nome} <span className="muted">/ {d.pontuacao_max}</span></th>)}
                  <button onClick={criarPessoa}>Adicionar</button>
                </tr>
                </thead>
                <tbody>
                {pessoas.map(p=>(
                  <tr key={p.id}>
                    <td>{p.inscricao}</td>
                    <td><strong>{p.nome}</strong></td>
                    {desafios.map(d=>(
                      <td key={d.id} className="text-right">
                        <input
                          style={{width:80, textAlign:'right'}}
                          type="number"
                          min={0}
                          max={d.pontuacao_max}
                          value={mapPont.get(p.id)?.get(d.id) ?? 0}
                          onChange={e=> atualizarPontuacao(p.id, d.id, Math.max(0, Math.min(Number(d.pontuacao_max), Number(e.target.value))))}
                        />
                      </td>
                    ))}
                    <td className="text-right">
                      <button className="ghost" onClick={()=>removerDesafio(d.id)}>Excluir</button>
                    </td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab==='rankingDesafio' && (
          <div className="card">
            <h3>Ranking por Desafio</h3>
            <div style={{maxWidth:340}}>
              <label>Selecione o desafio</label>
              <select value={desafioSelecionado} onChange={e=>setDesafioSelecionado(e.target.value)}>
                {desafios.map(d=> <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
            <div className="card" style={{marginTop:12}}>
              <table>
                <thead><tr><th>#</th><th>Participante</th><th className="text-right">Pontuação</th></tr></thead>
                <tbody>
                {(rankingPorDesafio[desafioSelecionado]?.lista||[]).map((r,i)=>(
                  <tr key={r.pessoa+i}><td>{i+1}</td><td>{r.pessoa}</td><td className="text-right">{r.score}</td></tr>
                ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab==='rankingGeral' && (
          <div className="card">
            <h3>Ranking Geral</h3>
            <table>
              <thead><tr><th>#</th><th>Participante</th><th className="text-right">Total</th><th className="text-right">Máximo possível</th></tr></thead>
              <tbody>
              {rankingGeral.map((r,i)=>(
                <tr key={r.pessoa}><td>{i+1}</td><td>{r.pessoa}</td><td className="text-right">{r.total}</td><td className="text-right muted">{r.max}</td></tr>
              ))}
              </tbody>
            </table>
          </div>
        )}

        {tab==='tabelaGeral' && (
          <div className="card" style={{overflowX:'auto'}}>
            <h3>Classificação Geral</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Participante</th>
                  {desafios.map(d=> <th key={d.id} className="text-right">{d.nome} <span className="muted">/ {d.pontuacao_max}</span></th>)}
                  <th className="text-right">Total Pontuação</th>
                </tr>
              </thead>
              <tbody>
              {tabelaGeral.map((row, idx)=>(
                <tr key={row.id}>
                  <td>{idx+1}</td>
                  <td><strong>{row.pessoa}</strong></td>
                  {row.porDesafio.map(c => <td key={c.desafioId} className="text-right">{c.score}</td>)}
                  <td className="text-right"><strong>{row.total}</strong></td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}

        {tab==='config' && role==='admin' && (
          <div className="card">
            <h3>Configurações</h3>
            <p className="muted">Usuários e senhas são gerenciados no painel do Supabase (Authentication → Users). Para trocar seu e-mail/senha, use o painel ou implemente uma tela de atualização via <code>supabase.auth.updateUser</code>.</p>
          </div>
        )}
      </div>
    </div>
  )
}
