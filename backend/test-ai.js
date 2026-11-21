
const fs = require('fs');

async function testAI() {
    try {
        const email = 'picasoaiden@gmail.com';
        const password = 'tester@12345';

        // Log in to CivicPulse
        const loginResponse = await fetch(
            'http://localhost:5000/api/auth/login',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            }
        );

        const login = await loginResponse.json();

        if (!loginResponse.ok || !login.token) {
            throw new Error('Login failed: ' + JSON.stringify(login));
        }

        console.log('Login successful!');

        // Read the test photograph
        const imagePath = 'C:/Users/AndaniM/Downloads/rubbish.jpg';

        const image = fs.readFileSync(imagePath);

        const form = new FormData();

        form.append(
            'file',
            new Blob([image], { type: 'image/jpeg' }),
            'rubbish.jpg'
        );

        // Send photograph through Express to FastAPI
        const aiResponse = await fetch(
            'http://localhost:5000/api/ai/classify-image',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${login.token}`
                },
                body: form
            }
        );

        const result = await aiResponse.json();

        console.log('HTTP Status:', aiResponse.status);
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

testAI();
