import { GoogleGenAI } from '@google/genai';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const ai = new GoogleGenAI({
  apiKey: process.env['GEMINI_API_KEY'],
});

const outputDir = join(process.cwd(), 'public', 'images');
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

const generationConfig = {
  temperature: 1,
  max_output_tokens: 65536,
  top_p: 0.95,
  thinking_level: 'low',
  image_config: {
    image_size: '1K',
  },
};

const images = [
  {
    name: 'hero-illustration',
    prompt: 'A modern illustration of a publisher workspace with multiple screens showing real-time ad analytics dashboards. Green accent lighting on the edges of screens. Dark moody atmosphere with deep black background. Professional editorial illustration style, clean and minimal. The screens show charts with upward trends and banner ad placements. No text, no logos.',
  },
  {
    name: 'publisher-illustration',
    prompt: 'An editorial illustration showing a smart automated system filling empty slots that a manual system missed. Think of a conveyor belt with bottles - the main nozzle skips some, but a secondary smart nozzle precisely fills every gap. Dark background with subtle green accent highlights. Clean professional illustration style, minimal and abstract. No text.',
  },
  {
    name: 'network-illustration',
    prompt: 'A clean editorial illustration of a central trading hub connecting multiple nodes in a network. Glowing green connection lines between nodes on a dark background. Abstract data visualization style showing aggregated marketplace connections. Professional minimal illustration. No text.',
  },
  {
    name: 'ai-optimization',
    prompt: 'An editorial illustration of an AI system analyzing data streams in real-time, with abstract neural pathways selecting the optimal choice from multiple options. Dark background with green accent glows on the active pathways. Clean professional illustration style, minimal and tech-forward. No text.',
  },
];

async function generateImage(name, prompt) {
  console.log(`Generating: ${name}...`);
  
  try {
    const interaction = await ai.interactions.create({
      model: 'models/gemini-3.1-flash-image',
      input: prompt,
      generation_config: generationConfig,
      response_modalities: ['image'],
    });

    // Check output_image field first
    if (interaction.output_image) {
      const img = interaction.output_image;
      const data = img.data;
      const mimeType = img.mime_type || img.mimeType;
      if (data && mimeType) {
        const buffer = Buffer.from(data, 'base64');
        const ext = mimeType.includes('jpeg') ? 'jpg' : 
                    mimeType.includes('webp') ? 'webp' : 'png';
        const filename = `${name}.${ext}`;
        const filepath = join(outputDir, filename);
        writeFileSync(filepath, buffer);
        console.log(`  Saved: ${filepath} (${(buffer.length / 1024).toFixed(1)}KB)`);
        return;
      }
    }

    // Fallback: check steps
    const steps = interaction.steps || [];
    for (const step of steps) {
      const parts = step.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          const ext = part.inlineData.mimeType?.includes('jpeg') ? 'jpg' : 
                      part.inlineData.mimeType?.includes('webp') ? 'webp' : 'png';
          const filename = `${name}.${ext}`;
          const filepath = join(outputDir, filename);
          writeFileSync(filepath, buffer);
          console.log(`  Saved: ${filepath} (${(buffer.length / 1024).toFixed(1)}KB)`);
          return;
        }
      }
    }
    
    console.error(`  No image data found for ${name}`);
    console.log('  output_image type:', typeof interaction.output_image);
    if (interaction.output_image) {
      console.log('  output_image keys:', Object.keys(interaction.output_image));
    }
  } catch (err) {
    console.error(`  Error generating ${name}:`, err.message);
  }
}

async function main() {
  console.log('Starting image generation...\n');
  
  for (const img of images) {
    await generateImage(img.name, img.prompt);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\nDone!');
}

main().catch(console.error);
