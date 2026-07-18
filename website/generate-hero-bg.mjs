import { GoogleGenAI } from '@google/genai';
import { writeFileSync } from 'fs';
import { join } from 'path';

const ai = new GoogleGenAI({
  apiKey: process.env['GEMINI_API_KEY'],
});

const generationConfig = {
  temperature: 1,
  max_output_tokens: 65536,
  top_p: 0.95,
  thinking_level: 'low',
  image_config: {
    image_size: '1K',
  },
};

async function generateImage(name, prompt) {
  console.log(`Generating: ${name}...`);
  
  try {
    const interaction = await ai.interactions.create({
      model: 'models/gemini-3.1-flash-image',
      input: prompt,
      generation_config: generationConfig,
      response_modalities: ['image'],
    });

    if (interaction.output_image) {
      const img = interaction.output_image;
      const data = img.data;
      const mimeType = img.mime_type || img.mimeType;
      if (data && mimeType) {
        const buffer = Buffer.from(data, 'base64');
        const ext = mimeType.includes('jpeg') ? 'jpg' : 
                    mimeType.includes('webp') ? 'webp' : 'png';
        const filename = `${name}.${ext}`;
        const filepath = join(process.cwd(), 'public', 'images', filename);
        writeFileSync(filepath, buffer);
        console.log(`  Saved: ${filepath} (${(buffer.length / 1024).toFixed(1)}KB)`);
        return;
      }
    }
    
    console.error(`  No image data found for ${name}`);
  } catch (err) {
    console.error(`  Error generating ${name}:`, err.message);
  }
}

async function main() {
  console.log('Generating hero backgrounds...\n');
  
  await generateImage(
    'hero-bg-noise',
    'Dark abstract background texture with scattered random dots and speckles of varying sizes and brightness. Organic, uneven distribution. Dark charcoal base with lighter gray particles. Like a night sky or dust particles. No repeating pattern, no symmetry, no lines.'
  );
  
  console.log('\nDone!');
}

main().catch(console.error);
