-- ============================================================
  -- LealCert — Importação de Usuários
  -- Execute no container do banco de produção
  -- ============================================================

  BEGIN;

  INSERT INTO users (id, name, cpf_cnpj, email, phone, role, password_hash)
VALUES (1, 'Administrador', '37147329856', 'willianlealusa@gmail.com', '4076751467', 'admin', '$2b$10$9edc9oallVQlYzOQ1jCpA.Q6tEPxeAbj7k/XiADcqmYOiRpy01a/e')
ON CONFLICT (cpf_cnpj) DO NOTHING;

INSERT INTO users (id, name, cpf_cnpj, email, phone, role, password_hash)
VALUES (2, 'João Contador', '12345678900', 'joao@escritorio.com.br', '(11) 99999-0001', 'contador', '$2b$10$r6ADqyA9IgoRqsijbLK4cOKeAceeV0WHNS9rh9msZbCMq8pJU5diS')
ON CONFLICT (cpf_cnpj) DO NOTHING;

INSERT INTO users (id, name, cpf_cnpj, email, phone, role, password_hash)
VALUES (10, 'avelar aline', '41145857884', 'willlealdasilva@gmail.com', '12345678', 'contador', '$2b$10$ThhMdwaZwbkrJzd0qX5FA.gD25ykR53O3eJnHXHYJmZNQRaS6L4q6')
ON CONFLICT (cpf_cnpj) DO NOTHING;

INSERT INTO users (id, name, cpf_cnpj, email, phone, role, password_hash)
VALUES (11, 'Administrador', '00000000000', 'admin@lealcert.com', NULL, 'contador', '$2b$10$V4A/7k2tQUEvFqEdk.eLNuhrdHYx11DFhBP5pIzcs3DPpEnZa8pzu')
ON CONFLICT (cpf_cnpj) DO NOTHING;

  -- Atualiza a sequence para não conflitar com novos cadastros
  SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 11));

  COMMIT;
  