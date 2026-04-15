export type Language = 'en' | 'ru' | 'es' | 'de' | 'fr' | 'pt' | 'uk' | 'tr'

export const LANGUAGES: { id: Language; label: string; nativeLabel: string }[] = [
  { id: 'en', label: 'English',    nativeLabel: 'English' },
  { id: 'ru', label: 'Russian',    nativeLabel: 'Русский' },
  { id: 'es', label: 'Spanish',    nativeLabel: 'Español' },
  { id: 'de', label: 'German',     nativeLabel: 'Deutsch' },
  { id: 'fr', label: 'French',     nativeLabel: 'Français' },
  { id: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
  { id: 'uk', label: 'Ukrainian',  nativeLabel: 'Українська' },
  { id: 'tr', label: 'Turkish',    nativeLabel: 'Türkçe' },
]

export type Translations = {
  // Sidebar
  newChat: string
  settings: string
  deleteConfirm: (title: string) => string
  renameChat: string
  // Chat
  selectOrCreate: string
  // InputBar
  inputPlaceholder: string
  // Settings
  settingsTitle: string
  aiProvider: string
  apiKey: string
  model: string
  loadingModels: string
  loadModels: string
  searchModel: string
  noModelsLoaded: string
  noModelsFound: string
  astrologyApiKey: string
  save: string
  saved: string
  language: string
}

const t: Record<Language, Translations> = {
  en: {
    newChat: 'New Chat',
    settings: 'Settings',
    deleteConfirm: (title) => `Delete chat "${title}"?`,
    renameChat: 'Rename',
    selectOrCreate: 'Select a chat or create a new one',
    inputPlaceholder: 'Ask about astrology... (Enter — send, Shift+Enter — new line)',
    settingsTitle: 'Settings',
    aiProvider: 'AI Provider',
    apiKey: 'API Key',
    model: 'Model',
    loadingModels: 'Loading...',
    loadModels: 'Load models',
    searchModel: 'Search model...',
    noModelsLoaded: 'Click "Load models"',
    noModelsFound: 'Nothing found',
    astrologyApiKey: 'Astrology API Key',
    save: 'Save',
    saved: 'Saved!',
    language: 'Language',
  },
  ru: {
    newChat: 'Новый чат',
    settings: 'Настройки',
    deleteConfirm: (title) => `Удалить чат "${title}"?`,
    renameChat: 'Переименовать',
    selectOrCreate: 'Выберите чат или создайте новый',
    inputPlaceholder: 'Спросите об астрологии... (Enter — отправить, Shift+Enter — новая строка)',
    settingsTitle: 'Настройки',
    aiProvider: 'Провайдер ИИ',
    apiKey: 'API ключ',
    model: 'Модель',
    loadingModels: 'Загрузка...',
    loadModels: 'Загрузить модели',
    searchModel: 'Поиск модели...',
    noModelsLoaded: 'Нажмите «Загрузить модели»',
    noModelsFound: 'Ничего не найдено',
    astrologyApiKey: 'Ключ Astrology API',
    save: 'Сохранить',
    saved: 'Сохранено!',
    language: 'Язык',
  },
  es: {
    newChat: 'Nuevo chat',
    settings: 'Configuración',
    deleteConfirm: (title) => `¿Eliminar el chat "${title}"?`,
    renameChat: 'Renombrar',
    selectOrCreate: 'Selecciona un chat o crea uno nuevo',
    inputPlaceholder: 'Pregunta sobre astrología... (Enter — enviar, Shift+Enter — nueva línea)',
    settingsTitle: 'Configuración',
    aiProvider: 'Proveedor de IA',
    apiKey: 'Clave API',
    model: 'Modelo',
    loadingModels: 'Cargando...',
    loadModels: 'Cargar modelos',
    searchModel: 'Buscar modelo...',
    noModelsLoaded: 'Haga clic en «Cargar modelos»',
    noModelsFound: 'No se encontró nada',
    astrologyApiKey: 'Clave de API de Astrología',
    save: 'Guardar',
    saved: '¡Guardado!',
    language: 'Idioma',
  },
  de: {
    newChat: 'Neuer Chat',
    settings: 'Einstellungen',
    deleteConfirm: (title) => `Chat "${title}" löschen?`,
    renameChat: 'Umbenennen',
    selectOrCreate: 'Wähle einen Chat oder erstelle einen neuen',
    inputPlaceholder: 'Frage zur Astrologie... (Enter — senden, Shift+Enter — neue Zeile)',
    settingsTitle: 'Einstellungen',
    aiProvider: 'KI-Anbieter',
    apiKey: 'API-Schlüssel',
    model: 'Modell',
    loadingModels: 'Laden...',
    loadModels: 'Modelle laden',
    searchModel: 'Modell suchen...',
    noModelsLoaded: 'Klicke auf «Modelle laden»',
    noModelsFound: 'Nichts gefunden',
    astrologyApiKey: 'Astrologie-API-Schlüssel',
    save: 'Speichern',
    saved: 'Gespeichert!',
    language: 'Sprache',
  },
  fr: {
    newChat: 'Nouveau chat',
    settings: 'Paramètres',
    deleteConfirm: (title) => `Supprimer le chat "${title}" ?`,
    renameChat: 'Renommer',
    selectOrCreate: 'Sélectionnez un chat ou créez-en un nouveau',
    inputPlaceholder: 'Posez une question sur l\'astrologie... (Entrée — envoyer, Shift+Entrée — nouvelle ligne)',
    settingsTitle: 'Paramètres',
    aiProvider: 'Fournisseur d\'IA',
    apiKey: 'Clé API',
    model: 'Modèle',
    loadingModels: 'Chargement...',
    loadModels: 'Charger les modèles',
    searchModel: 'Rechercher un modèle...',
    noModelsLoaded: 'Cliquez sur «Charger les modèles»',
    noModelsFound: 'Rien trouvé',
    astrologyApiKey: 'Clé API Astrologie',
    save: 'Enregistrer',
    saved: 'Enregistré !',
    language: 'Langue',
  },
  pt: {
    newChat: 'Novo chat',
    settings: 'Configurações',
    deleteConfirm: (title) => `Excluir o chat "${title}"?`,
    renameChat: 'Renomear',
    selectOrCreate: 'Selecione um chat ou crie um novo',
    inputPlaceholder: 'Pergunte sobre astrologia... (Enter — enviar, Shift+Enter — nova linha)',
    settingsTitle: 'Configurações',
    aiProvider: 'Provedor de IA',
    apiKey: 'Chave de API',
    model: 'Modelo',
    loadingModels: 'Carregando...',
    loadModels: 'Carregar modelos',
    searchModel: 'Buscar modelo...',
    noModelsLoaded: 'Clique em «Carregar modelos»',
    noModelsFound: 'Nada encontrado',
    astrologyApiKey: 'Chave da API de Astrologia',
    save: 'Salvar',
    saved: 'Salvo!',
    language: 'Idioma',
  },
  uk: {
    newChat: 'Новий чат',
    settings: 'Налаштування',
    deleteConfirm: (title) => `Видалити чат "${title}"?`,
    renameChat: 'Перейменувати',
    selectOrCreate: 'Оберіть чат або створіть новий',
    inputPlaceholder: 'Запитайте про астрологію... (Enter — надіслати, Shift+Enter — новий рядок)',
    settingsTitle: 'Налаштування',
    aiProvider: 'Провайдер ШІ',
    apiKey: 'API ключ',
    model: 'Модель',
    loadingModels: 'Завантаження...',
    loadModels: 'Завантажити моделі',
    searchModel: 'Пошук моделі...',
    noModelsLoaded: 'Натисніть «Завантажити моделі»',
    noModelsFound: 'Нічого не знайдено',
    astrologyApiKey: 'Ключ Astrology API',
    save: 'Зберегти',
    saved: 'Збережено!',
    language: 'Мова',
  },
  tr: {
    newChat: 'Yeni Sohbet',
    settings: 'Ayarlar',
    deleteConfirm: (title) => `"${title}" sohbetini sil?`,
    renameChat: 'Yeniden adlandır',
    selectOrCreate: 'Bir sohbet seçin veya yeni bir tane oluşturun',
    inputPlaceholder: 'Astroloji hakkında sorun... (Enter — gönder, Shift+Enter — yeni satır)',
    settingsTitle: 'Ayarlar',
    aiProvider: 'YZ Sağlayıcısı',
    apiKey: 'API Anahtarı',
    model: 'Model',
    loadingModels: 'Yükleniyor...',
    loadModels: 'Modelleri yükle',
    searchModel: 'Model ara...',
    noModelsLoaded: '«Modelleri yükle» düğmesine tıklayın',
    noModelsFound: 'Hiçbir şey bulunamadı',
    astrologyApiKey: 'Astroloji API Anahtarı',
    save: 'Kaydet',
    saved: 'Kaydedildi!',
    language: 'Dil',
  },
}

export default t
