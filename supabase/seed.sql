-- Données de départ : école pilote (D8) et école de démonstration pour les revues Apple/Google (NF-STORE-03).
-- Les comptes étudiants de test se créent par le parcours d'inscription de l'app.

insert into public.schools (name, slug, email_domains, campus_address, campus_lat, campus_lng, declared_student_count, settings)
values
  -- Coordonnées, effectif et liste des formations provisoires : à vérifier avec l'école avant le pilote.
  ('ESTA Belfort', 'esta-belfort', '{esta-groupe.fr}', '3 rue du Docteur Fréry, 90000 Belfort', 47.6406, 6.8535, 300,
   '{"mentoring_enabled": true, "programs": ["Cycle Bachelor", "Cycle Master"]}'),
  ('École Démo UNION', 'demo', '{demo.union-app.fr}', '1 place de la Démo, 75001 Paris', 48.8606, 2.3376, 50,
   '{"mentoring_enabled": true, "programs": []}')
on conflict (slug) do nothing;
