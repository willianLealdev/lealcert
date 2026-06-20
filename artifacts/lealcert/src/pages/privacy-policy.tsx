export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        <div className="border-b pb-6">
          <h1 className="text-3xl font-bold text-foreground">Política de Privacidade e Uso de Dados Pessoais</h1>
          <p className="text-sm text-muted-foreground mt-2">Versão 5.1 — Última atualização: 23/02/2026</p>
        </div>

        <Section title="1. Introdução">
          <p>A Política de Privacidade e Uso de Dados Pessoais tem como objetivo principal evidenciar a transparência do compromisso da Safeweb em garantir a proteção dos dados fornecidos pelos titulares de dados pessoais.</p>
          <p>Não fornecemos informações pessoais para terceiros sem a devida autorização e não divulgamos informações que possam identificar os titulares dos dados, salvo em casos de pedido judicial ou determinação legal.</p>
          <p>A presente Política abrange o tratamento que a Safeweb concede às informações capazes de identificar os usuários, coletadas diretamente em nosso site e armazenadas em bases de dados eletrônicos por meio dos cadastros preenchidos.</p>
          <p>A aceitação da nossa Política se dará quando você acessar ou utilizar o site, aplicativo ou serviços da Safeweb. Isso indicará que você está ciente e em total acordo com a forma como utilizamos as suas informações e seus dados, cujo tratamento se dá em observância à Lei Geral de Proteção de Dados Pessoais n° 13.709/2018 (LGPD), bem como as demais normativas aplicáveis, como as oriundas do Instituto Nacional de Tecnologia da Informação ("ITI").</p>
          <p>A Safeweb conta com normativas de cunho interno que visam aprimorar e manter as melhores práticas de proteção de dados pessoais e segurança da informação, com o intuito de atender as normas de segurança da informação do ITI e dos demais órgãos reguladores, assim como adota procedimentos de governança, como Plano de Resposta a Incidentes de Dados Pessoais, para garantir a segurança nos processos de tratamento de dados.</p>
        </Section>

        <Section title="2. Definições">
          <dl className="space-y-3">
            {[
              ["Agentes de tratamento", "O controlador e o operador."],
              ["ANPD", "Autoridade Nacional de Proteção de Dados — órgão da administração pública responsável por zelar, implementar e fiscalizar o cumprimento da LGPD em todo o território nacional."],
              ["Banco de dados", "Conjunto estruturado de dados pessoais, estabelecido em um ou em vários locais, em suporte eletrônico ou físico."],
              ["Bloqueio", "Suspensão temporária de qualquer operação de tratamento, mediante guarda do dado pessoal ou do banco de dados."],
              ["Consentimento", "Manifestação livre, informada e inequívoca pela qual o titular concorda com o tratamento de seus dados pessoais para uma finalidade determinada."],
              ["Controlador", "Aquele que toma as decisões referentes ao tratamento de dados pessoais."],
              ["Cookie", "Pequeno pedaço de informação que um site atribui ao dispositivo do titular enquanto visualiza um site, permitindo navegação eficiente, ativação de recursos e personalização."],
              ["Dado Pessoal", "Informação relacionada a pessoa natural identificada ou identificável."],
              ["Dado Pessoal Sensível", "Dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural."],
              ["DPO (Encarregado)", "Indicado pelo controlador e operador para atuar como canal de comunicação entre o controlador, os titulares dos dados e a ANPD."],
              ["Eliminação", "Exclusão de dado ou de conjunto de dados armazenados em banco de dados, independentemente do procedimento empregado."],
              ["ITI", "Instituto Nacional de Tecnologia da Informação — Autoridade Certificadora Raiz da ICP-Brasil."],
              ["Operador", "Pessoa natural ou jurídica, de direito público ou privado, que realiza o tratamento de dados pessoais."],
              ["Titular", "Pessoa natural a quem se referem os dados pessoais que são objeto de tratamento pela Safeweb."],
              ["Transferência internacional de dados", "Transferência de dados pessoais para país estrangeiro ou organismo internacional do qual o país seja membro."],
            ].map(([term, def]) => (
              <div key={term}>
                <dt className="font-semibold text-foreground">{term}</dt>
                <dd className="text-muted-foreground ml-4">{def}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="3. Direitos dos Usuários sobre os Dados Pessoais">
          <SubSection title="3.1 Direito de Revogação">
            <p>Titulares de dados pessoais tratados pela Safeweb poderão solicitar a revogação das permissões de uso de dados, uma vez que o prazo legal do tratamento esteja expirado, quando for o caso.</p>
          </SubSection>
          <SubSection title="3.2 Direito de Divulgação">
            <p>A Safeweb não divulga os dados pessoais dos titulares, exceto por determinação legal ou a pedido do próprio titular do dado.</p>
            <p>O titular dos dados pessoais tem o direito de saber, a qualquer tempo, que dados estão sendo tratados, como estão sendo tratados e, quando for o caso, com quem são compartilhados, podendo acessar tais informações através de solicitação prévia.</p>
          </SubSection>
          <SubSection title="3.3 Direito de Retificação">
            <p>O titular tem direito de solicitar a retificação de seus dados pessoais incompletos, inexatos ou desatualizados, exceto quando se trata de informações contidas dentro dos Certificados Digitais, uma vez que tais informações são gravadas no momento da emissão do Certificado sem a possibilidade de alteração posterior.</p>
          </SubSection>
          <SubSection title="3.4 Direito à Exclusão">
            <p>O titular tem direito à exclusão definitiva dos dados pessoais que tiver fornecido à Safeweb, a seu requerimento ou ao término da relação entre as partes, quando ultrapassado o período obrigatório de armazenamento dos dados pessoais, conforme preconiza a LGPD e demais legislações aplicáveis.</p>
          </SubSection>
          <SubSection title="3.5 Direito à Portabilidade">
            <p>As solicitações de portabilidade de dados serão analisadas caso a caso, devendo o titular solicitar através do site{" "}
              <a href="https://portaldotitular.safecomply.com.br/safecomply/safeweb" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                portaldotitular.safecomply.com.br
              </a>.
            </p>
          </SubSection>
        </Section>

        <Section title="4. Responsabilidades dos Titulares dos Dados Pessoais">
          <p>Os titulares dos dados pessoais têm a obrigação de assegurar que os dados fornecidos à Safeweb são precisos, completos e atualizados.</p>
        </Section>

        <Section title="5. Política de Cookies">
          <p>Cookies são arquivos de texto contendo pequenas quantidades de informações, que são baixadas para o seu dispositivo de navegação quando você visita um site. Eles visam facilitar ou aprimorar a experiência do usuário.</p>
          <p>Ao utilizar o nosso site, você concorda com a utilização dos cookies descritos nesta Política. Você pode alterar a configuração dos cookies, a qualquer tempo, diretamente no seu navegador. Ao bloquear os cookies, algumas funcionalidades do site poderão ser limitadas.</p>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold w-1/4">Finalidade</th>
                  <th className="text-left px-4 py-3 font-semibold">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ["Preferências, recursos e serviços", "Utilizamos cookies para habilitar a funcionalidade de nossos serviços e fornecer recursos, estatísticas e conteúdo personalizado. Também usamos essas tecnologias para lembrar informações sobre seu navegador e suas preferências."],
                  ["Plugins", "Utilizamos cookies para habilitar plugins dentro e fora do site da Safeweb. Nossos plug-ins podem ser encontrados nos serviços da Safeweb ou em sites de terceiros. Se você interagir com um plugin, ele utilizará cookies para identificar você e iniciar sua solicitação."],
                  ["Publicidade personalizada", "Os cookies nos ajudam a mostrar publicidade relevante para você, tanto dentro como fora dos nossos serviços, a medir o desempenho de tais anúncios e a fornecer relatórios sobre eles."],
                  ["Análise e pesquisa", "Nós ou nossos prestadores de serviços usamos cookies para entender, melhorar e pesquisar produtos, recursos e serviços, inclusive enquanto você navega em nossos sites."],
                  ["Usabilidade", "Cookie utilizado para guardar as informações compartilhadas com solução de autoatendimento, para melhorar a experiência de uso no site."],
                  ["Essenciais", "Permitem a navegação e a utilização das aplicações, tal como acessar áreas seguras do site através de login. Sem estes cookies, os serviços que os exijam não podem ser prestados."],
                ].map(([name, desc]) => (
                  <tr key={name} className="align-top">
                    <td className="px-4 py-3 font-medium text-foreground">{name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4">Para controlar ou excluir cookies, acesse as configurações do seu navegador, geralmente encontradas em "Ajuda", "Ferramentas" ou "Editar", ou use o atalho <kbd className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">Ctrl + Shift + Delete</kbd> nos navegadores Firefox, Chrome e Edge.</p>
        </Section>

        <Section title="6. Controlador de Dados">
          <p>Conforme determina a LGPD, a Safeweb é qualificada como controladora de dados pessoais:</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <tbody className="divide-y divide-border">
                {[
                  ["Nome", "Safeweb Segurança da Informação Ltda."],
                  ["CNPJ", "01.579.286/0001-74"],
                  ["Endereço", "Av. Princesa Isabel, 828 – Santana – Porto Alegre/RS – CEP 90620-000"],
                  ["Encarregado (DPO)", "Gisele Strey"],
                  ["E-mail", "privacidade@safeweb.com.br"],
                  ["Telefones", "+55 0800-728-5900 | +55 51 3018-0300"],
                ].map(([k, v]) => (
                  <tr key={k} className="align-top">
                    <td className="px-4 py-3 font-semibold text-foreground bg-muted w-1/3">{k}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="7. Sobre o Tratamento dos Seus Dados Pessoais">
          <SubSection title="7.1 Quais informações são coletadas?">
            <p>Podemos coletar os seguintes dados pessoais durante o seu cadastro ou no uso de produtos e/ou serviços da Safeweb:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1 text-muted-foreground">
              <li>Nome</li>
              <li>CPF, RG, CNH, Título de Eleitor, PIS, RNE ou passaporte</li>
              <li>Data de nascimento</li>
              <li>E-mail</li>
              <li>Número de telefone</li>
              <li>Endereço / código postal / país</li>
              <li>Nome de usuário / senha</li>
              <li>Dados biométricos (face, digitais e voz)</li>
              <li>Dados financeiros</li>
            </ul>
          </SubSection>
          <SubSection title="7.2 Como coletamos seus dados?">
            <ul className="list-disc ml-6 mt-2 space-y-1 text-muted-foreground">
              <li>Presencialmente ou mediante videoconferência, via sistemas próprios de emissão de certificado realizados por Autoridades de Registro</li>
              <li>Via sistema de chamados Qualitor para credenciamento de Agentes de Registro</li>
              <li>Através de cookies, quando usuários acessam nossos websites</li>
              <li>Via e-mail</li>
              <li>Via site, através de preenchimento de formulários de cadastro e uso de produtos</li>
            </ul>
          </SubSection>
          <SubSection title="7.3 Para qual finalidade utilizamos seus dados?">
            <p>As informações solicitadas aos titulares de dados são as necessárias para adquirir serviços e/ou produtos, receber informações, orçamentos e propostas e acessar as plataformas da Safeweb, tendo por finalidade:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1 text-muted-foreground">
              <li>Identificação cadastral do titular para fins de compra de produtos ou serviços, incluindo emissão de certificados digitais, carimbos do tempo, comunicação de ofertas e emissão de nota fiscal eletrônica</li>
              <li>Identificação visual do titular para fins de emissão de Certificado Digital, seja presencial ou por meio de videoconferência</li>
              <li>Identificação profissional do titular para fins de preenchimento de vaga de trabalho</li>
              <li>Utilização dos cookies para aperfeiçoamento dos serviços do site</li>
              <li>E-mails para comunicação de expiração/vencimento de produtos/serviços</li>
              <li>Plataformas online, e-mail ou telefone para sanar dúvidas, dar suporte ou auxiliar os titulares dos dados</li>
            </ul>
          </SubSection>
          <SubSection title="7.4 Base Legal">
            <p>O tratamento de dados pessoais pela Safeweb tem por base legal as seguintes hipóteses, nos termos do art. 7º da LGPD:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1 text-muted-foreground">
              <li>Cumprimento da obrigação legal e regulatória pelo Controlador</li>
              <li>Garantia de prevenção à fraude e segurança do titular</li>
              <li>Para a execução dos serviços e produtos contratados</li>
              <li>Legítimo interesse do Controlador</li>
            </ul>
          </SubSection>
          <SubSection title="7.5 Dados de Crianças e Adolescentes">
            <p>A Safeweb, para a prestação de serviços de emissão de certificado digital, pode vir a coletar dados de crianças ou adolescentes com menos de 16 (dezesseis) anos, somente mediante a coleta de consentimento de um dos pais ou responsável legal.</p>
            <p>Ao concordar com esta Política, você declara estar apto para praticar todos os atos da vida civil, não sendo criança ou adolescente, na forma da lei.</p>
          </SubSection>
          <SubSection title="7.6 Como mantemos seus dados seguros?">
            <p>As informações pessoais coletadas são armazenadas com padrões rígidos de confidencialidade e segurança. Nenhum documento, informação ou registro é fornecido a terceiros, exceto se:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1 text-muted-foreground">
              <li>Expressamente autorizado pelo titular do dado</li>
              <li>Mediante ordem judicial</li>
              <li>Cumprimento de obrigação ou determinação legal</li>
            </ul>
            <p className="mt-2">A Safeweb não comercializa dados pessoais dos titulares que estão sob sua guarda.</p>
          </SubSection>
          <SubSection title="7.7 Por quanto tempo armazenamos seus dados?">
            <p>Armazenamos os seus dados durante o período necessário para cumprir os objetivos e finalidades para os quais foram coletados.</p>
            <p>Para dados pessoais de titulares de certificação digital, por no mínimo 7 (sete) anos, a partir da expiração ou revogação do Certificado Digital, conforme DOC-ICP-05, item 5.5.2.</p>
          </SubSection>
          <SubSection title="7.8 Relacionamento com Terceiros">
            <p>Esta Política de Privacidade é aplicável à Safeweb Segurança da Informação Ltda., não sendo aplicável a qualquer outro site que possa estar associado.</p>
            <p>Para o atendimento das finalidades elencadas nesta Política, os dados poderão ser compartilhados com as empresas do Grupo Safepar, bem como provedores de serviço e fornecedores.</p>
          </SubSection>
          <SubSection title="7.9 Transferência Internacional de Dados">
            <p>A Safeweb conta com postos de atendimento de parceiros no exterior para coleta de dados pessoais para a oferta de seus serviços. Contudo, não realiza a transferência de dados pessoais para seus parceiros no exterior.</p>
            <p>Na hipótese de transferência de dados pessoais para o exterior, a Safeweb garante que os dados somente serão enviados para países cuja ANPD considere ter grau de proteção adequado.</p>
          </SubSection>
        </Section>

        <Section title="8. Atualização da Política de Privacidade">
          <p>A Safeweb se reserva ao direito de alterar essa Política periodicamente, sempre que necessário, visando fornecer ao titular de dados mais segurança e transparência.</p>
          <p>Sempre que houver alterações que ensejem novas autorizações, será publicada uma nova versão, sujeita a um novo consentimento.</p>
          <p>No âmbito de emissão de certificados digitais, a Safeweb é auditada anualmente por empresa de auditoria independente que, dentre outras incumbências, verifica os controles de proteção de dados.</p>
        </Section>

        <Section title="9. Legislação Aplicável">
          <p>Este documento é regido e deve ser interpretado de acordo com a legislação brasileira. Fica eleito o Foro da Comarca de Porto Alegre, Estado do Rio Grande do Sul, como competente para dirimir quaisquer questões porventura oriundas do presente documento.</p>
        </Section>

        <Section title="10. Condições Gerais">
          <p>A Safeweb Segurança da Informação Ltda. se reserva ao direito de notificar seus clientes de qualquer informação que afete a segurança dos produtos ou serviços fornecidos.</p>
          <p>Se você tiver alguma pergunta sobre esta Política de Privacidade ou as práticas deste site, entre em contato pelo e-mail{" "}
            <a href="mailto:privacidade@safeweb.com.br" className="text-primary underline">privacidade@safeweb.com.br</a>
            {" "}ou através do{" "}
            <a href="https://portaldotitular.safecomply.com.br/safecomply/safeweb" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Portal de Atendimento ao Titular
            </a>.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold text-foreground border-b pb-2">{title}</h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
