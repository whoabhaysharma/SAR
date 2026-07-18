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
    
    console.error(`  No image data for ${name}`);
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  }
}

async function main() {
  console.log('Generating AdBunny logos...\n');
  
  await generateImage(
    'adbunny-logo',
    'Minimal modern tech logo for "AdBunny" brand. Clean geometric abstract mark. Dark background (#0a0a0a). The mark should be a simple white geometric shape - maybe two overlapping circles, or a subtle abstract bunny shape, or a clean monogram. Very minimal, no text. Just the icon mark. Professional, modern, like Stripe or Linear or Vercel style. White or light gray shapes on dark background.'
  );
  
  await generateImage(
    'adbunny-logo-2',
    'Clean modern logo mark for a tech company called AdBunny. Abstract geometric shape on dark background. White or cream colored. Minimal and distinctive. Could be a tilted geometric shape, interlocking shapes, or an abstract rabbit ear design. Very professional and subtle. No text, no words, just the icon mark.'
  );
  
  console.log('\nDone!');
}

main().catch(console.error);
