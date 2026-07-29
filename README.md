# Assiduidade WhatsApp

Aplicação web para importar uma exportação `.txt` de uma conversa do WhatsApp e transformar mensagens de picagem em registos diários de assiduidade.

## Funcionalidades

- Upload por clique ou drag-and-drop.
- Leitura dos formatos de exportação WhatsApp mais comuns em Android e iOS.
- Reconhecimento configurável de `IN` e `OUT` (inclui, por defeito, Entrada/Saída e Check in/Check out).
- Lista configurável de textos de mensagens a ignorar.
- Exportação idempotente de um ficheiro por cada mês completo (`assiduidade_MM_AAAA.txt`).
- Edição ou remoção auditável de mensagens, guardando uma cópia com o sufixo `_editado`.
- Análise separada por participante da conversa.
- Dois períodos configuráveis:
  - manhã: 09:00–13:30;
  - tarde: 13:31–19:00.
- Um período só fica completo quando existe um `IN` seguido de um `OUT` dentro do mesmo período.
- Estados diários: completo, incompleto ou sem registos.
- Identificação de picagens em falta, ordem inválida, duplicados e registos fora dos períodos.
- Gráfico diário, resumo e tabela de detalhe.
- Intervalo de datas e dias úteis configuráveis para permitir contabilizar ausências.
- Motor de regras isolado da interface, para facilitar novos requisitos.

## Tecnologias

- React + TypeScript + Vite
- Recharts
- Node.js + Express + TypeScript
- Multer para upload e armazenamento local auditável

## Executar localmente

```bash
cp .env.example .env
npm install
npm run dev
```

Abrir `http://localhost:5173`.

### Aceder a partir da mesma rede

Ao executar `npm run dev`, o frontend e a API escutam em todas as interfaces de rede.
Num computador ou telemóvel ligado à mesma rede, abrir:

```text
http://IP-DO-COMPUTADOR:5173
```

O Vite apresenta no terminal o endereço de rede disponível. Em alternativa, consultar
o IP local nas definições de rede do sistema operativo. A firewall do computador deve
permitir ligações às portas `5173` e `3001`.

### Docker

```bash
docker compose up --build
```

Abrir `http://localhost:3001`.

## Produção

```bash
npm run build
npm start
```

O servidor Express disponibiliza a API e, quando `client/dist` existe, serve também o frontend compilado em `http://localhost:3001`.

## Formato esperado das mensagens

Exemplos reconhecidos:

```text
17/07/2026, 09:02 - Ana: IN
17/07/2026, 13:06 - Ana: OUT
[17/07/2026, 13:35:10] Ana: Entrada
[17/07/2026, 18:02:45] Ana: Saída
```

Também são aceites anos com dois dígitos, segundos opcionais e mensagens com várias linhas.

## Organização para evolução

- `server/src/parser/whatsapp.ts`: transforma o TXT em mensagens estruturadas.
- `server/src/domain/attendance.ts`: reconhece picagens e aplica as regras de assiduidade.
- `server/src/config.ts`: regras e aliases por defeito.
- `client/src/App.tsx`: configuração e visualização.

Para adicionar um novo período, alterar horários, dias úteis ou aliases, não é necessário modificar o parser. Para regras mais complexas, deve ser acrescentado um novo avaliador no domínio e mantido o contrato da API.

## Ficheiros persistidos

Os uploads originais são arquivados sem alterações em `data/imports`. Quando uma mensagem
é editada ou removida, é criada uma cópia com o sufixo `_editado`; o original não é
substituído. Quando o ficheiro segue o nome mensal `assiduidade_MM_AAAA.txt`, o original
e a cópia `_editado` ficam juntos em `data/exports`. As exportações mensais também são
guardadas nessa pasta. Se um nome mensal já existir, esse mês é ignorado.

Um mês é considerado completo quando está totalmente contido entre a primeira e a última
data da conversa. Um mês na extremidade do intervalo só é aceite se o ficheiro cobrir
desde o primeiro até ao último dia desse mês.
