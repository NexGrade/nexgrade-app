"""[TURMA-POR-DIA] (05/11/2026) testes do diagnostico de turma por dia. Rodar (sem ortools):
    cd cpsat-service && python -m unittest discover -s tests -v
"""
import sys
import unittest
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from diagnostico_inviabilidade import diagnosticar_inviabilidade  # noqa: E402


@dataclass
class L:  # mesmos campos que o diagnostico le de solver.DisciplinaTurma
    turma: str
    codigo_sae: str
    nome: str
    aulas_semana: int
    professor: str
    max_aulas_dia: int
    ultima_aula_turma: int | None = None
    grupo_dupla: str | None = None
    assincrona: bool = False


def turma_cheia(bloq_segunda_prof_a=False, limite=2):
    """Turma T com 30 aulas em 30 horarios (6 por dia): 5 professores x 6 aulas."""
    linhas = [L("T", f"D{i}", f"Disc {i}", 6, f"P{i}", limite) for i in range(5)]
    bloqueios = []
    if bloq_segunda_prof_a:
        # P0..P3 nao vem na segunda: so P4 sobra, com no maximo `limite` aulas -> segunda nao fecha
        bloqueios = [(f"P{i}", 0, a) for i in range(4) for a in range(1, 7)]
    return linhas, bloqueios


def diag(linhas, bloqueios, fixar=None):
    return diagnosticar_inviabilidade(linhas, bloqueios, 6, 24, fixar=fixar)


class TurmaPorDia(unittest.TestCase):
    def test_turma_cheia_sem_bloqueio_nao_acusa(self):
        linhas, bloq = turma_cheia()
        self.assertEqual([c for c in diag(linhas, bloq) if c.startswith("Turma T:")], [])

    def test_dia_que_poucos_professores_podem_vir_acusa(self):
        linhas, bloq = turma_cheia(bloq_segunda_prof_a=True, limite=2)
        causas = [c for c in diag(linhas, bloq) if c.startswith("Turma T:")]
        self.assertEqual(len(causas), 1)
        self.assertIn("precisa de 30 aulas", causas[0])
        self.assertIn("cobrir 26", causas[0])  # segunda 2 (so P4, limite 2) + 4 dias x 6
        self.assertIn("Segunda 2 de 6", causas[0])

    def test_turma_com_folga_nao_acusa(self):
        # mesma segunda ruim, mas a turma so tem 24 aulas: cabe nos outros 4 dias
        linhas = [L("T", f"D{i}", f"Disc {i}", 6, f"P{i}", 2) for i in range(4)]
        bloq = [(f"P{i}", 0, a) for i in range(3) for a in range(1, 7)]
        self.assertEqual([c for c in diag(linhas, bloq) if c.startswith("Turma T:")], [])

    def test_horario_sem_nenhum_professor_livre(self):
        # todos bloqueados na 6a aula de segunda: 29 de 30 -> impossivel, e a frase aponta o horario
        linhas, _ = turma_cheia(limite=3)
        bloq = [(f"P{i}", 0, 6) for i in range(5)]
        causas = [c for c in diag(linhas, bloq) if c.startswith("Turma T:")]
        self.assertEqual(len(causas), 1)
        self.assertIn("Segunda 6ª aula", causas[0])

    def test_assincrona_nao_conta_na_demanda(self):
        linhas, bloq = turma_cheia(bloq_segunda_prof_a=True, limite=2)
        for dt in linhas[:4]:
            dt.assincrona = True  # 24 das 30 sao assincronas: demanda 6, sobra muito
        self.assertEqual([c for c in diag(linhas, bloq) if c.startswith("Turma T:")], [])

    def test_dupla_conta_uma_vez_so(self):
        # D0 em dupla (P0 + PX, juntos): a demanda e 30, nao 36 -> turma cheia sem bloqueio nao acusa
        linhas, _ = turma_cheia(limite=2)
        linhas[0].grupo_dupla = "g1"
        linhas.append(L("T", "D0", "Disc 0", 6, "PX", 2, grupo_dupla="g1"))
        self.assertEqual([c for c in diag(linhas, []) if c.startswith("Turma T:")], [])

    def test_dupla_so_onde_os_dois_estao_livres(self):
        # D0 em dupla (P0 + PX). PX so vem na segunda; P1..P4 nao vem na segunda.
        # Segunda: so a dupla (limite 2) -> 2 de 6. Terca a sexta: P1..P4, 2 cada = 6. Total 26 < 30.
        linhas, _ = turma_cheia(limite=2)
        linhas[0].grupo_dupla = "g1"
        linhas.append(L("T", "D0", "Disc 0", 6, "PX", 2, grupo_dupla="g1"))
        bloq = [("PX", d, a) for d in range(1, 5) for a in range(1, 7)] + [(f"P{i}", 0, a) for i in range(1, 5) for a in range(1, 7)]
        causas = [c for c in diag(linhas, bloq) if c.startswith("Turma T:")]
        self.assertEqual(len(causas), 1)
        self.assertIn("cobrir 26", causas[0])

    def test_aula_fixa_conta_como_livre(self):
        # P0..P3 bloqueados na segunda, mas P0 tem 2 aulas fixas la (o item 1 acusa a fixa; aqui so nao pode inventar falta)
        linhas, bloq = turma_cheia(bloq_segunda_prof_a=True, limite=2)
        fixar = {("T", "D0", "P0"): [(0, 1), (0, 2)], ("T", "D1", "P1"): [(0, 3), (0, 4)]}
        causas = [c for c in diag(linhas, bloq, fixar) if c.startswith("Turma T:")]
        self.assertEqual(causas, [])  # segunda: P0 2 + P1 2 + P4 2 = 6


class HorarioSemProfessor(unittest.TestCase):
    """[HORARIO-SEM-PROFESSOR] caso do Iedo: num horario, menos professores livres do que turmas cheias."""

    def _duas_turmas(self):
        # T1 e T2 cheias (30 em 30). P0 da aula nas duas; P1..P4 so na T1; Q1..Q4 so na T2.
        linhas = [L("T1", "D0", "D0", 6, "P0", 2), L("T2", "D0", "D0", 6, "P0", 2)]
        linhas += [L("T1", f"D{i}", f"D{i}", 6, f"P{i}", 2) for i in range(1, 5)]
        linhas += [L("T2", f"D{i}", f"D{i}", 6, f"Q{i}", 2) for i in range(1, 5)]
        return linhas

    def test_um_professor_para_duas_turmas_no_mesmo_horario(self):
        linhas = self._duas_turmas()
        # quarta 6a: so P0 livre (todos os outros bloqueados) -> 2 turmas, 1 professor
        bloq = [(p, 2, 6) for p in ["P1", "P2", "P3", "P4", "Q1", "Q2", "Q3", "Q4"]]
        causas = [c for c in diag(linhas, bloq) if c.startswith("Quarta, 6ª aula")]
        self.assertEqual(len(causas), 1)
        self.assertIn("2 turmas cheias", causas[0])
        self.assertIn("cobrir 1", causas[0])

    def test_um_livre_em_cada_turma_nao_acusa(self):
        linhas = self._duas_turmas()
        bloq = [(p, 2, 6) for p in ["P0", "P2", "P3", "P4", "Q2", "Q3", "Q4"]]  # P1 livre na T1, Q1 na T2
        self.assertEqual([c for c in diag(linhas, bloq) if "6ª aula" in c and c.startswith("Quarta")], [])

    def test_turma_com_folga_nao_entra(self):
        linhas = self._duas_turmas()
        linhas = [d for d in linhas if not (d.turma == "T2" and d.professor == "Q4")]  # T2 com 24 aulas: nao e cheia
        bloq = [(p, 2, 6) for p in ["P1", "P2", "P3", "P4", "Q1", "Q2", "Q3"]]
        self.assertEqual([c for c in diag(linhas, bloq) if c.startswith("Quarta, 6ª aula")], [])


if __name__ == "__main__":
    unittest.main()
