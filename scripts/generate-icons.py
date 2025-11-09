#!/usr/bin/env python3
"""
Simple icon generator for PWA
Creates basic PNG icons from scratch
"""

from PIL import Image, ImageDraw
import os

def create_vinyl_icon(size, output_path):
    """Create a vinyl record icon"""
    # Create image with black background
    img = Image.new('RGB', (size, size), color='#0a0a0a')
    draw = ImageDraw.Draw(img)
    
    center = size // 2
    
    # Vinyl record circles
    radii = [
        (int(size * 0.35), '#ff00ff'),  # Outer magenta
        (int(size * 0.31), '#1a1a1a'),  # Black
        (int(size * 0.27), '#cc00cc'),  # Purple
        (int(size * 0.23), '#1a1a1a'),  # Black
        (int(size * 0.19), '#00ffff'),  # Cyan
        (int(size * 0.15), '#1a1a1a'),  # Black
        (int(size * 0.11), '#ff00ff'),  # Magenta center
        (int(size * 0.06), '#0a0a0a'),  # Center hole
    ]
    
    for radius, color in radii:
        bbox = [center - radius, center - radius, center + radius, center + radius]
        draw.ellipse(bbox, fill=color)
    
    # Save
    img.save(output_path, 'PNG')
    print(f'✅ Created {output_path} ({size}x{size})')

def main():
    # Create public directory if it doesn't exist
    os.makedirs('public', exist_ok=True)
    
    # Generate icons
    print('🎨 Generating PWA icons...\n')
    create_vinyl_icon(192, 'public/icon-192.png')
    create_vinyl_icon(512, 'public/icon-512.png')
    print('\n🎉 Icons generated successfully!')

if __name__ == '__main__':
    try:
        main()
    except ImportError:
        print('⚠️  PIL/Pillow not found. Installing...')
        os.system('pip install Pillow')
        print('\n🔄 Retrying...\n')
        main()
