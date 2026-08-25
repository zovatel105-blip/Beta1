import { createUser } from './lib/db.js'

const testUsers = [
  { username: 'carlos23', email: 'carlos@test.com', password: 'test123', avatarUrl: 'https://i.pravatar.cc/120?img=1' },
  { username: 'maria_lopez', email: 'maria@test.com', password: 'test123', avatarUrl: 'https://i.pravatar.cc/120?img=5' },
  { username: 'juan_dev', email: 'juan@test.com', password: 'test123', avatarUrl: 'https://i.pravatar.cc/120?img=10' },
  { username: 'ana_designer', email: 'ana@test.com', password: 'test123', avatarUrl: 'https://i.pravatar.cc/120?img=15' },
  { username: 'pedro_gamer', email: 'pedro@test.com', password: 'test123', avatarUrl: 'https://i.pravatar.cc/120?img=20' },
]

async function seed() {
  console.log('🌱 Creando usuarios de prueba...')
  
  for (const userData of testUsers) {
    try {
      const user = await createUser(userData)
      console.log(`✅ Usuario creado: ${user.username} (${user.email})`)
    } catch (err) {
      if (err.message.includes('taken')) {
        console.log(`⚠️  Usuario ya existe: ${userData.username}`)
      } else {
        console.error(`❌ Error creando ${userData.username}:`, err.message)
      }
    }
  }
  
  console.log('\n✅ Seed completo!')
  console.log('\n👤 Usuarios de prueba creados:')
  console.log('   Username: carlos23     | Password: test123')
  console.log('   Username: maria_lopez  | Password: test123')
  console.log('   Username: juan_dev     | Password: test123')
  console.log('   Username: ana_designer | Password: test123')
  console.log('   Username: pedro_gamer  | Password: test123')
  
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌ Error en seed:', err)
  process.exit(1)
})
