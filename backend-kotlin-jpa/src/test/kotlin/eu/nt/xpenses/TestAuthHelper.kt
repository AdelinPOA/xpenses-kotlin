package eu.nt.xpenses

import jakarta.servlet.http.Cookie
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

class TestAuthHelper(private val mockMvc: MockMvc) {

    fun loginAs(username: String, password: String): Cookie {
        val result = mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"$username","password":"$password"}""")
        ).andExpect(status().isOk).andReturn()

        return result.response.getCookie("access_token")
            ?: error("No access_token cookie in login response for '$username'")
    }
}
