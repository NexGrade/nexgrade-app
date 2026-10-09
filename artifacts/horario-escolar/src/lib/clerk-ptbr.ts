// [CLERK-PTBR] Textos em portugues das telas do Clerk usadas no NexGrade
// (janela de conta, menu do avatar e seletor de escola). Escrito no proprio
// projeto, sem o pacote @clerk/localizations: instalar o pacote com o pnpm
// local reescrevia o pnpm-lock.yaml (removia o artifacts/mockup-sandbox) e
// arriscava o build do Render. Chaves que o Clerk nao reconhecer sao ignoradas
// (o texto fica no padrao em ingles), entao isto e seguro de ajustar aos poucos.
export const clerkPtBR = {
  locale: "pt-BR",
  userButton: {
    action__manageAccount: "Gerenciar conta",
    action__signOut: "Sair",
    action__signOutAll: "Sair de todas as contas",
    action__addAccount: "Adicionar conta",
  },
  organizationSwitcher: {
    action__createOrganization: "Criar escola",
    action__manageOrganization: "Gerenciar",
    notSelected: "Nenhuma escola selecionada",
    personalWorkspace: "Conta pessoal",
  },
  userProfile: {
    navbar: {
      title: "Conta",
      description: "Gerencie os dados da sua conta.",
      account: "Perfil",
      security: "Segurança",
    },
    start: {
      headerTitle__account: "Dados do perfil",
      headerTitle__security: "Segurança",
      profileSection: {
        title: "Perfil",
        primaryButton: "Editar perfil",
      },
      emailAddressesSection: {
        title: "E-mails",
        primaryButton: "Adicionar e-mail",
        detailsAction__primary: "Concluir verificação",
        detailsAction__nonPrimary: "Tornar principal",
        detailsAction__unverified: "Verificar",
        destructiveAction: "Remover e-mail",
      },
      phoneNumbersSection: {
        title: "Telefones",
        primaryButton: "Adicionar telefone",
        destructiveAction: "Remover telefone",
      },
      connectedAccountsSection: {
        title: "Contas conectadas",
        primaryButton: "Conectar conta",
      },
      passwordSection: {
        title: "Senha",
        primaryButton__setPassword: "Definir senha",
        primaryButton__updatePassword: "Alterar senha",
      },
      activeDevicesSection: {
        title: "Dispositivos conectados",
        destructiveAction: "Sair deste dispositivo",
      },
      dangerSection: {
        title: "Excluir conta",
        deleteAccountButton: "Excluir conta",
      },
    },
    profilePage: {
      title: "Editar perfil",
      imageFormTitle: "Foto do perfil",
      imageFormSubtitle: "Enviar foto",
      imageFormDestructiveActionSubtitle: "Remover foto",
      successMessage: "Perfil atualizado.",
    },
    passwordPage: {
      title__set: "Definir senha",
      title__update: "Alterar senha",
      successMessage__set: "Senha definida.",
      successMessage__update: "Senha alterada.",
      readonly: "Sua senha não pode ser alterada aqui porque você entra por outro provedor.",
    },
    emailAddressPage: {
      title: "Adicionar e-mail",
      formHint: "Você vai receber um código de verificação neste e-mail.",
      removeResource: {
        title: "Remover e-mail",
        messageLine1: "{{identifier}} será removido desta conta.",
        messageLine2: "Você não vai mais conseguir entrar com este e-mail.",
        successMessage: "{{emailAddress}} foi removido da sua conta.",
      },
    },
    deletePage: {
      title: "Excluir conta",
      messageLine1: "Tem certeza de que deseja excluir sua conta?",
      messageLine2: "Esta ação é permanente e não pode ser desfeita.",
      actionDescription: "Digite \"Excluir conta\" abaixo para continuar.",
      confirm: "Excluir conta",
    },
  },
  formButtonPrimary: "Continuar",
  formButtonReset: "Cancelar",
  formFieldLabel__firstName: "Nome",
  formFieldLabel__lastName: "Sobrenome",
  formFieldLabel__emailAddress: "E-mail",
  formFieldLabel__password: "Senha",
  formFieldLabel__newPassword: "Nova senha",
  formFieldLabel__confirmPassword: "Confirmar senha",
  formFieldLabel__currentPassword: "Senha atual",
  formFieldLabel__signOutOfOtherSessions: "Sair de todos os outros dispositivos",
  formFieldInputPlaceholder__emailAddress: "Digite seu e-mail",
  // [LOGIN-PTBR] telas de entrar e cadastrar
  dividerText: "ou",
  socialButtonsBlockButton: "Continuar com {{provider|titleize}}",
  lastAuthenticationStrategyBadge: "Último usado",
  footerPageLink__help: "Ajuda",
  footerPageLink__privacy: "Privacidade",
  footerPageLink__terms: "Termos",
  signIn: {
    start: {
      title: "Entrar",
      titleCombined: "Entrar no {{applicationName}}",
      subtitle: "Bem-vindo(a) de volta! Entre para continuar.",
      subtitleCombined: "Bem-vindo(a) de volta! Entre para continuar.",
      actionText: "Não tem uma conta?",
      actionLink: "Cadastre-se",
      actionLink__use_email: "Usar e-mail",
      actionLink__use_email_username: "Usar e-mail ou usuário",
    },
    password: {
      title: "Digite sua senha",
      subtitle: "Digite a senha da sua conta para continuar.",
      actionLink: "Usar outro método",
    },
    forgotPasswordAlternativeMethods: {
      title: "Esqueceu a senha?",
      label__alternativeMethods: "Ou entre por outro método",
      blockButton__resetPassword: "Redefinir senha",
    },
    forgotPassword: {
      title: "Redefinir senha",
      subtitle: "Enviaremos um código para o seu e-mail.",
      formTitle: "Código de redefinição",
      resendButton: "Não recebeu o código? Reenviar",
    },
    resetPassword: {
      title: "Redefinir senha",
      formButtonPrimary: "Redefinir senha",
      successMessage: "Sua senha foi redefinida com sucesso.",
    },
    emailCode: {
      title: "Verifique seu e-mail",
      subtitle: "Digite o código enviado para o seu e-mail.",
      formTitle: "Código de verificação",
      resendButton: "Não recebeu o código? Reenviar",
    },
    alternativeMethods: {
      title: "Outros métodos de acesso",
      actionLink: "Ajuda",
      actionText: "Não tem nenhum destes?",
      blockButton__emailCode: "Enviar código por e-mail",
      blockButton__password: "Entrar com senha",
    },
  },
  signUp: {
    start: {
      title: "Criar conta",
      titleCombined: "Criar conta no {{applicationName}}",
      subtitle: "Bem-vindo(a)! Preencha os dados para começar.",
      subtitleCombined: "Bem-vindo(a)! Preencha os dados para começar.",
      actionText: "Já tem uma conta?",
      actionLink: "Entrar",
    },
    emailCode: {
      title: "Verifique seu e-mail",
      subtitle: "Digite o código enviado para o seu e-mail.",
      formTitle: "Código de verificação",
      resendButton: "Não recebeu o código? Reenviar",
    },
  },
  // [LOGIN-PTBR] etapa de cadastro da escola (organizacao) logo apos criar a conta
  taskChooseOrganization: {
    chooseOrganization: {
      title: "Escolha a sua escola",
      subtitle: "Selecione a escola para continuar.",
    },
    createOrganization: {
      title: "Cadastre a sua escola",
      subtitle: "Informe o nome da escola para continuar.",
      formButtonSubmit: "Continuar",
    },
    signOut: {
      actionText: "Conectado como {{identifier}}",
      actionLink: "Sair",
    },
  },
  formFieldLabel__organizationName: "Nome da escola",
  formFieldInputPlaceholder__organizationName: "Ex.: Escola Municipal Alfa",
  formFieldLabel__organizationSlug: "Endereço da escola",
  formFieldLabel__name: "Nome da escola",
  badge__primary: "Principal",
  badge__thisDevice: "Este dispositivo",
  badge__unverified: "Não verificado",
  badge__you: "Você",
};