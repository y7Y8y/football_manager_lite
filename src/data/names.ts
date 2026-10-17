/**
 * Réserve de noms fictifs.
 *
 * Aucun nom réel de joueur ou de club professionnel : la doc 10 et la doc 03
 * exigent une base fictive, et la doc 08 interdit tout asset de tiers.
 * Les listes sont assez longues pour que le générateur ne se répète pas sur
 * 600 joueurs.
 */

export const FIRST_NAMES: readonly string[] = [
  'Adama', 'Ahmed', 'Akim', 'Alassane', 'Amadou', 'Ange', 'Anthony', 'Antoine',
  'Arthur', 'Aubin', 'Aurélien', 'Bakary', 'Baptiste', 'Bilal', 'Brahima',
  'Bruno', 'Cédric', 'Cheikh', 'Clément', 'Cyrille', 'Damien', 'Daniel',
  'David', 'Denis', 'Djibril', 'Edouard', 'Elhadj', 'Emile', 'Enzo', 'Eric',
  'Fabrice', 'Fadel', 'Ferdinand', 'Fernand', 'Franck', 'Gaël', 'Gaétan',
  'Gérard', 'Ghislain', 'Grégory', 'Hakim', 'Hamza', 'Hervé', 'Ibrahim',
  'Idriss', 'Ismaël', 'Jean', 'Jérôme', 'Joël', 'Jordan', 'Jules', 'Kader',
  'Karim', 'Kévin', 'Kouadio', 'Lamine', 'Laurent', 'Léon', 'Loïc', 'Lucas',
  'Ludovic', 'Malik', 'Mamadou', 'Marc', 'Marius', 'Mathieu', 'Maxime',
  'Médéric', 'Mehdi', 'Michel', 'Morgan', 'Moussa', 'Nabil', 'Nathan',
  'Nicolas', 'Olivier', 'Oumar', 'Pascal', 'Patrick', 'Paul', 'Pierre',
  'Quentin', 'Rachid', 'Raphaël', 'Rémi', 'Rodrigue', 'Romain', 'Salif',
  'Samuel', 'Serge', 'Seydou', 'Sofiane', 'Stéphane', 'Tanguy', 'Théo',
  'Thomas', 'Tidiane', 'Valentin', 'Victor', 'Vincent', 'William', 'Yacine',
  'Yann', 'Yao', 'Youssef', 'Zacharie',
];

export const LAST_NAMES: readonly string[] = [
  'Abalo', 'Adjovi', 'Agbodjan', 'Akouete', 'Alao', 'Amorin', 'Andrianasy',
  'Assogba', 'Attipou', 'Aworet', 'Bakayoko', 'Balogoun', 'Barry', 'Bassole',
  'Bationo', 'Bella', 'Bengaly', 'Berthé', 'Biaou', 'Bocoum', 'Bogno',
  'Bonou', 'Boro', 'Boukary', 'Camara', 'Chabi', 'Cissé', 'Coulibaly',
  'Dabbagh', 'Danho', 'Daouda', 'Debaecker', 'Diallo', 'Diarra', 'Dossou',
  'Doumbia', 'Ekotto', 'Fadiga', 'Ferrer', 'Gakpo', 'Gandarmerie', 'Gbédji',
  'Guigma', 'Hamedoun', 'Hounkpe', 'Ibrahim', 'Kaboré', 'Kane', 'Keita',
  'Koffi', 'Kone', 'Koudjou', 'Kounde', 'Lado', 'Lemoine', 'Lopes', 'Maiga',
  'Mancabou', 'Marchand', 'Mensah', 'Moreau', 'Ndiaye', 'Nguessan', 'Novak',
  'Osei', 'Osimhen', 'Ozturk', 'Petrov', 'Razafy', 'Sacko', 'Sane', 'Sanogo',
  'Santamaria', 'Saré', 'Sawadogo', 'Silva', 'Sissoko', 'Sow', 'Tanguy',
  'Tapsoba', 'Tembely', 'Thiam', 'Thiombiano', 'Thuram', 'Toure', 'Traoré',
  'Vargas', 'Vasseur', 'Vidal', 'Yeo', 'Zato', 'Zerbo', 'Zoungrana',
];

/** Villes fictives, calibrées pour héberger 16 clubs sans doublon. */
export const CITIES: readonly string[] = [
  'Port-Sable', 'Haut-Rivage', 'Val-d’Or', 'Sainte-Colline', 'Basse-Terre',
  'Les Cayes', 'Mont-Fleuri', 'Rivage-Neuf', 'Cap-Lumière', 'Bois-Chéri',
  'Plaine-Longue', 'Saint-Micaël', 'Vallée-Grise', 'Anse-Profonde',
  'Coteau-Blanc', 'Terre-Haute', 'Marais-Doux', 'Roc-Noir',
];

/**
 * Préfixes et suffixes de noms de clubs. Le générateur les combine avec un
 * tirage déterministe : aucun club ne peut porter le nom d'un vrai club.
 */
export const CLUB_PREFIXES: readonly string[] = [
  'Athlétic', 'Union', 'Olympique', 'Étoile', 'Racing', 'Sporting',
  'Association', 'Cercle', 'Éclair', 'Valeur', 'Jeunesse', 'Espoir',
  'Aigle', 'Faucon', 'Ibis', 'Cobra', 'Panthère', 'Buffalo',
];

export const CLUB_SUFFIXES: readonly string[] = [
  'de la Côte', 'du Fleuve', 'du Port', 'de la Plaine', 'des Collines',
  'du Plateau', 'de l’Anse', 'du Rocher', 'de la Savane', 'du Marigot',
  'de la Presqu’île', 'du Bassin', 'des Lagunes', 'du Cap',
];

export const STADIUMS: readonly string[] = [
  'Stade Municipal', 'Stade de la Solidarité', 'Arène du Littoral',
  'Stade des Lagunes', 'Enceinte du Plateau', 'Stade de l’Amitié',
  'Stade Olympique Local', 'Stade du Marigot', 'Stade des Jeunes',
  'Stade de la Colline',
];

/** Noms de staff, distincts des joueurs pour rester lisibles en interface. */
export const STAFF_NAMES: readonly string[] = [
  'Aboubacar Sy', 'Alain Ferrand', 'Amadou Cissé', 'André Mensah',
  'Blaise Kouassi', 'Christian N’Guessan', 'Daniel Zerbo', 'Emile Gbédji',
  'Fatou Diarra', 'François Bakayoko', 'Gilbert Sarr', 'Hassan Barry',
  'Igor Petrov', 'Jacques Tanguy', 'Karim Hamedoun', 'Lassina Sawadogo',
  'Marcel Adjovi', 'Norbert Boukary', 'Ousmane Sow', 'Patrick Debaecker',
  'Raoul Akpo', 'Salif Kanté', 'Thomas Bella', 'Ulrich Dabbagh',
];

/** Types de blessures fictifs. */
export const INJURY_TYPES: readonly string[] = [
  'Ischio-jambiers', 'Adducteurs', 'Cheville', 'Genou', 'Mollet',
  'Publique', 'Épaule', 'Côtes', 'Commotion', 'Pied',
];

/** Maladies possibles en conférence de presse (M6). Réservé ici. */
export const PRESS_THEMES: readonly string[] = [
  'forme de l’équipe', 'transfert', 'blessure', 'arbitrage', 'classement',
  'concurrent direct', 'jeunes', 'finances',
];
