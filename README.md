# Smart AI Whiteboard – ក្ដារខៀនឆ្លាតវៃ AI (khmersmartbaord)

ក្ដារខៀនឌីជីថលឆ្លាតវៃ AI ទំនើប ងាយស្រួលប្រើប្រាស់ គាំទ្រភាសាខ្មែរ និងអង់គ្លេស សម្រាប់កុំព្យូទ័រ Tablet និងទូរស័ព្ទ។

## លក្ខណៈពិសេសចម្បង (Key Features)

1. **ផ្ទាំងក្ដារខៀនឆ្លាតវៃ (Smart Whiteboard):**
   - សរសេរ និងគូរដោយ Mouse, Touch និង Stylus
   - គាំទ្រទាំងអក្សរខ្មែរ និងអង់គ្លេស
   - ស្បែកក្ដារខៀន ៣ ប្រភេទ (ក្ដារបៃតង Chalkboard, ក្ដារស Whiteboard, ក្ដារខ្មៅ Blackboard)
   - របៀបពេញអេក្រង់ (Fullscreen Mode) និងពង្រីកមិនព្រិល (Vector-Sharp Zoom រហូតដល់ 500%)
   - ប៊ិចគូរ, ប៊ិចហាយឡាយ, ជ័រលុប, ឡាស៊ែរ (Laser Trail), ពិលបញ្ចាំង (Spotlight)
   - បន្ទាត់វាស់ (Ruler cm) និងវាំងននបិទបាំងចម្លើយ (Screen Shade)
   - នាំចេញជា PNG, JPG និង PDF កម្រិតច្បាស់ខ្ពស់

2. **មុខងារ AI អាន និងសរសេរ (AI Read & Write):**
   - អានអត្ថបទលើក្ដារខៀនដោយ OCR ស្គាល់អក្សរខ្មែរ និងអង់គ្លេស
   - កែតម្រូវអក្ខរាវិរុទ្ធ (Proofread)
   - បកប្រែភាសា ខ្មែរ ↔ អង់គ្លេស (Translate)
   - សង្ខេបមេរៀន (Summarize) និងពន្យល់មេរៀន (Explain)
   - បម្លែងសំឡេងទៅជាអត្ថបទ (Speech to Text) និងអានជាសំឡេង (Text to Speech)

3. **គណិតវិទ្យា & ក្រាបឆ្លាតវៃ (AI Math & Graph):**
   - ស្គាល់សញ្ញាស្មើ `=` ដោយដៃលើក្ដាដើម្បីគណនាស្វ័យប្រវត្តិ (AI Handwritten Math Solver)
   - គាំទ្រលេខខ្មែរ (០-៩) និងប្រភាគ (Fractions)
   - គូសក្រាបអនុគមន៍ $y = f(x)$
   - តម្រុយអ័ក្សកូអរដោនេ $Oxy$ និង $Oxyz$ (អាចបង្វិលក្នុងលំហបាន)
   - រូបធរណីមាត្រក្នុងលំហ (គូប, ស៊ីឡាំង, កោណ, ពីរ៉ាមីត, ស្វ៊ែរ, ព្រីស)

4. **ស្ទូឌីយោ 3D ដោយស្វ័យប្រវត្តិ (AI Auto 3D Studio):**
   - បម្លែងអត្ថបទ គំនូរព្រាង ឬរូបភាព 2D ទៅជាម៉ូដែល 3D (Text / Sketch / Image to 3D)
   - 3D Shape Reconstruction (Extrude, 360° Revolve Lathe, Hologram)
   - គណនាមាឌ (Volume) និងផ្ទៃក្រឡា (Surface Area)
   - នាំចេញម៉ូដែល 3D ជា `.GLB`, `.GLTF`, និង `.OBJ`

---

## ការដំឡើង និងដំណើរការ (Run Locally)

### តម្រូវការជាមុន (Prerequisites)
- [Node.js](https://nodejs.org/) (v18+)
- [Git](https://git-scm.com/)

### ជំហានដំណើរការ (Setup Steps)

1. **ទាញយកគម្រោង (Clone the repository):**
   ```bash
   git clone https://github.com/romperb9-byte/khmersmartbaord.git
   cd khmersmartbaord
   ```

2. **ដំឡើង Dependencies:**
   ```bash
   npm install
   ```

3. **កំណត់ Environment Variables:**
   ចម្លងឯកសារ `.env.example` ទៅជា `.env` ហើយបញ្ចូល Gemini API Key របស់អ្នក៖
   ```env
   GEMINI_API_KEY=YOUR_GEMINI_API_KEY
   ```

4. **ដំណើរការកម្មវិធី (Start Development Server):**
   ```bash
   npm run dev
   ```
   បើកកម្មវិធីក្នុង Browser តាមរយៈ `http://localhost:3000`

---

## បច្ចេកវិទ្យាប្រើប្រាស់ (Tech Stack)
- **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide Icons, Three.js
- **Backend:** Express, Node.js
- **AI Engine:** Google Gemini API (`@google/genai`)
- **Database & Auth:** Firebase Firestore, Firebase Authentication
- **Exporting:** jsPDF, Canvas API, Three.js GLTF/OBJ Exporters
