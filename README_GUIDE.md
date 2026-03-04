# ScholarEarn: AI-Powered Academic Excellence

ScholarEarn is an educational platform that leverages the power of Gemini AI to create personalized learning experiences for students in Grades 1-12. It features both individual study paths and competitive classroom group battles.

## 🚀 Key Features

- **Personalized Individual Batches**: AI-generated quizzes tailored to the student's grade, subject, and current level.
- **Classroom Battle Mode**: Engage up to 5 groups in a turn-based academic competition with unique question sets for each group.
- **Advanced Question Types**: Includes Multiple Choice (MCQ), Word Problems, Case Studies (for Grade 9+), and Visual Analysis questions.
- **AI-Powered Insights**: Real-time text-to-speech (TTS) explanations for every question.
- **Achievement System**: Earn virtual currency and downloadable badges for academic milestones.

---

## 🛠️ AI Logic & Prompts

### 1. Quiz Generation Prompt
The core of ScholarEarn is the `generateQuizQuestions` function, which uses the `gemini-2.5-flash` model with a strict JSON schema.

**System Instruction:**
> "You are an AI Tutor. Output valid JSON only. Focus on Case Studies for higher grades."

**Dynamic Prompt Template:**
```text
Act as an Expert Academic Mentor for Grade {gradeLevel}.
Subject: {subject}.
Topic: {topic}.
Context: {focusContext}.
{groupContext}
Current Level: {level}.
RandomSeed: {seed}.

TASK: Generate exactly 5 questions for this Batch.

QUESTION TYPES DISTRIBUTION:
- If Grade >= 9: Include at least 1 'CASE_STUDY' and 1 'VISUAL_ANALYSIS'.
- If Grade < 9: Mostly MCQ and WORD_PROBLEM.

GUIDELINES:
- CASE_STUDY: Provide a short paragraph (50-80 words) in 'contextMaterial' that the student must analyze to answer the question.
- VISUAL_ANALYSIS: Describe a diagram, graph, or physical setup in 'contextMaterial' (e.g., "A circuit diagram shows two resistors in parallel...") and ask a question based on it.
- The 'explanation' must be detailed.
```

### 2. JSON Response Schema
To ensure reliability, we use the following schema:
- `type`: Array of Objects
- `properties`:
    - `id`: Number
    - `type`: String (MCQ, WORD_PROBLEM, CASE_STUDY, VISUAL_ANALYSIS)
    - `contextMaterial`: String (Scenario text)
    - `text`: String (The question)
    - `options`: Array of 4 Strings
    - `correctIndex`: Number (0-3)
    - `explanation`: String (Detailed reasoning)

---

## ⚙️ Setup Instructions

### 1. Prerequisites
- Node.js installed on your machine.
- A modern web browser.

### 2. Get Your Google AI API Key
ScholarEarn is designed to be free for students and teachers by allowing you to use your own API key from Google AI Studio.

1.  Visit **[Google AI Studio](https://aistudio.google.com/)**.
2.  Sign in with your Google Account.
3.  Click on **"Get API key"** in the left sidebar.
4.  Click **"Create API key in new project"**.
5.  Copy your new API key.

### 3. Environment Configuration
Create a `.env` file in the root directory of the project and add your key:

```env
GEMINI_API_KEY=[INSERT_YOUR_API_KEY_HERE]
```

### 4. Installation
```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

---

## 📚 Classroom Mode Guide
1.  Toggle to **Classroom** mode on the entry screen.
2.  Enter the **Subject** and a **Specific Topic** (e.g., "Photosynthesis").
3.  Click **Setup Classroom Battle**.
4.  Configure your groups (2-5 groups). You can also **Upload Accessions** (a `.txt` or `.csv` file with group names) to quickly populate the list.
5.  Launch the battle! Each group will take turns answering their own unique set of 5 questions.
6.  View the final **Leaderboard** to see which group achieved academic excellence!

---

## 📜 License
This project is licensed under the MIT License.
